// friscy-proxy - WebTransport bidirectional network proxy
//
// Provides full TCP/UDP networking for browser-based friscy instances,
// including support for incoming connections (listen/accept).
//
// Uses:
//   - WebTransport (HTTP/3 + QUIC) for browser communication
//   - Native Go net package for real network connections
//   - Each TCP connection = 1 WebTransport stream
//   - UDP = WebTransport datagrams
//
// Usage:
//   go run . -listen :4433 -cert cert.pem -key key.pem
//
// For development, generate self-signed certs:
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
//     -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"

package main

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/go-containerregistry/pkg/crane"
	"github.com/google/go-containerregistry/pkg/name"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

// Rate limiter tracks per-IP usage
type RateLimiter struct {
	mu              sync.Mutex
	ipSessions      map[string]int       // current concurrent sessions per IP
	ipConnections   map[string]int       // total connections made today per IP
	ipLastReset     map[string]time.Time // when counters were last reset
	maxSessions     int                  // max concurrent sessions per IP
	maxConnsPerDay  int                  // max outbound connections per IP per day
}

func NewRateLimiter(maxSessions, maxConnsPerDay int) *RateLimiter {
	return &RateLimiter{
		ipSessions:     make(map[string]int),
		ipConnections:  make(map[string]int),
		ipLastReset:    make(map[string]time.Time),
		maxSessions:    maxSessions,
		maxConnsPerDay: maxConnsPerDay,
	}
}

func (rl *RateLimiter) extractIP(addr string) string {
	// Handle both "ip:port" and bare "ip"
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}

// TryAcquireSession returns true if a new session is allowed for this IP
func (rl *RateLimiter) TryAcquireSession(remoteAddr string) bool {
	ip := rl.extractIP(remoteAddr)
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if rl.ipSessions[ip] >= rl.maxSessions {
		return false
	}
	rl.ipSessions[ip]++
	return true
}

// ReleaseSession decrements the session count for an IP
func (rl *RateLimiter) ReleaseSession(remoteAddr string) {
	ip := rl.extractIP(remoteAddr)
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if rl.ipSessions[ip] > 0 {
		rl.ipSessions[ip]--
	}
	if rl.ipSessions[ip] == 0 {
		delete(rl.ipSessions, ip)
	}
}

// TryConnection returns true if a new outbound connection is allowed for this IP
func (rl *RateLimiter) TryConnection(remoteAddr string) bool {
	ip := rl.extractIP(remoteAddr)
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Reset daily counter if needed
	now := time.Now()
	if last, ok := rl.ipLastReset[ip]; !ok || now.Sub(last) > 24*time.Hour {
		rl.ipConnections[ip] = 0
		rl.ipLastReset[ip] = now
	}

	if rl.ipConnections[ip] >= rl.maxConnsPerDay {
		return false
	}
	rl.ipConnections[ip]++
	return true
}

func (rl *RateLimiter) Stats() (totalSessions int, totalIPs int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for _, v := range rl.ipSessions {
		totalSessions += v
	}
	return totalSessions, len(rl.ipSessions)
}

// Protocol message types (varint prefix)
const (
	// Container -> Host (requests)
	MsgConnect = 0x01 // Connect to remote host
	MsgBind    = 0x02 // Bind to local port
	MsgListen  = 0x03 // Start listening
	MsgSend    = 0x04 // Send data on connection
	MsgClose   = 0x05 // Close connection
	MsgSendTo  = 0x06 // Send UDP datagram

	// Host -> Container (responses/events)
	MsgConnected    = 0x81 // Connection established
	MsgConnectError = 0x82 // Connection failed
	MsgData         = 0x83 // Incoming data
	MsgAccept       = 0x84 // New incoming connection
	MsgClosed       = 0x85 // Connection closed
	MsgError        = 0x86 // General error
	MsgRecvFrom     = 0x87 // UDP datagram received
)

// Socket types
const (
	SOCK_STREAM = 1
	SOCK_DGRAM  = 2
)

// Connection represents a virtual socket
type Connection struct {
	id       uint32
	sockType int
	conn     net.Conn
	listener net.Listener
	udpConn  *net.UDPConn
	closed   atomic.Bool
	mu       sync.Mutex
}

// Session represents a WebTransport client session
type Session struct {
	wt          *webtransport.Session
	connections sync.Map // uint32 -> *Connection
	nextConnID  atomic.Uint32
	ctx         context.Context
	cancel      context.CancelFunc
	streamMu    sync.Mutex
	rateLimiter *RateLimiter
	remoteIP    string
}

// Server is the WebTransport proxy server
type Server struct {
	certFile    string
	keyFile     string
	listen      string
	sessions    sync.Map
	rateLimiter *RateLimiter
	allowedOrigins map[string]bool // nil = allow all
}

func NewServer(listen, certFile, keyFile string, rl *RateLimiter, origins []string) *Server {
	s := &Server{
		listen:      listen,
		certFile:    certFile,
		keyFile:     keyFile,
		rateLimiter: rl,
	}
	if len(origins) > 0 {
		s.allowedOrigins = make(map[string]bool)
		for _, o := range origins {
			s.allowedOrigins[o] = true
		}
	}
	return s
}

func (s *Server) Run() error {
	cert, err := tls.LoadX509KeyPair(s.certFile, s.keyFile)
	if err != nil {
		return fmt.Errorf("failed to load certificates: %w", err)
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		NextProtos:   []string{"h3"},
	}

	wtServer := &webtransport.Server{
		H3: http3.Server{
			Addr:      s.listen,
			TLSConfig: tlsConfig,
		},
		CheckOrigin: func(r *http.Request) bool {
			if s.allowedOrigins == nil {
				return true
			}
			origin := r.Header.Get("Origin")
			return s.allowedOrigins[origin]
		},
	}

	http.HandleFunc("/connect", func(w http.ResponseWriter, r *http.Request) {
		remoteIP := r.RemoteAddr
		// Check rate limit: concurrent sessions per IP
		if !s.rateLimiter.TryAcquireSession(remoteIP) {
			log.Printf("Rate limited (sessions): %s", remoteIP)
			http.Error(w, "too many sessions", http.StatusTooManyRequests)
			return
		}

		session, err := wtServer.Upgrade(w, r)
		if err != nil {
			s.rateLimiter.ReleaseSession(remoteIP)
			log.Printf("WebTransport upgrade failed: %v", err)
			return
		}
		s.handleSession(session, remoteIP)
	})

	log.Printf("friscy-proxy listening on https://localhost%s/connect", s.listen)
	log.Printf("WebTransport ready for bidirectional networking")

	return wtServer.ListenAndServe()
}

func (s *Server) handleSession(wt *webtransport.Session, remoteIP string) {
	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		wt:          wt,
		ctx:         ctx,
		cancel:      cancel,
		rateLimiter: s.rateLimiter,
		remoteIP:    remoteIP,
	}

	log.Printf("New WebTransport session from %s", wt.RemoteAddr())

	// Handle incoming streams (from container)
	go session.acceptStreams()

	// Note: Datagrams (UDP) would require quic-go datagram API access
	// For now, UDP is tunneled over streams like TCP

	// Wait for session to close
	<-wt.Context().Done()
	cancel()

	// Cleanup all connections
	session.connections.Range(func(key, value interface{}) bool {
		if conn, ok := value.(*Connection); ok {
			conn.Close()
		}
		return true
	})

	s.rateLimiter.ReleaseSession(remoteIP)
	log.Printf("WebTransport session closed (released session for %s)", remoteIP)
}

func (sess *Session) acceptStreams() {
	for {
		stream, err := sess.wt.AcceptStream(sess.ctx)
		if err != nil {
			if sess.ctx.Err() != nil {
				return
			}
			log.Printf("AcceptStream error: %v", err)
			return
		}

		go sess.handleStream(stream)
	}
}

func (sess *Session) handleStream(stream webtransport.Stream) {
	defer stream.Close()

	// Read message type
	msgType, err := binary.ReadUvarint(byteReader{stream})
	if err != nil {
		log.Printf("Failed to read message type: %v", err)
		return
	}

	switch msgType {
	case MsgConnect:
		sess.handleConnect(stream)
	case MsgBind:
		sess.handleBind(stream)
	case MsgListen:
		sess.handleListen(stream)
	case MsgSend:
		sess.handleSend(stream)
	case MsgClose:
		sess.handleClose(stream)
	default:
		log.Printf("Unknown message type: %d", msgType)
	}
}

func (sess *Session) handleConnect(stream webtransport.Stream) {
	// Read: connID (4), sockType (1), hostLen (2), host, port (2)
	var header [4 + 1 + 2]byte
	if _, err := io.ReadFull(stream, header[:]); err != nil {
		log.Printf("Connect: failed to read header: %v", err)
		return
	}

	connID := binary.BigEndian.Uint32(header[0:4])
	sockType := int(header[4])
	hostLen := binary.BigEndian.Uint16(header[5:7])

	hostBuf := make([]byte, hostLen+2)
	if _, err := io.ReadFull(stream, hostBuf); err != nil {
		log.Printf("Connect: failed to read host/port: %v", err)
		return
	}

	host := string(hostBuf[:hostLen])
	port := binary.BigEndian.Uint16(hostBuf[hostLen:])
	addr := fmt.Sprintf("%s:%d", host, port)

	log.Printf("[%d] Connect to %s (type=%d)", connID, addr, sockType)

	// Block connections to private/loopback addresses (prevent SSRF)
	if isPrivateAddr(host) {
		log.Printf("[%d] Blocked connect to private address %s", connID, addr)
		sess.sendEvent(MsgConnectError, connID, []byte("connection to private addresses not allowed"))
		return
	}

	// Rate limit outbound connections per IP
	if !sess.rateLimiter.TryConnection(sess.remoteIP) {
		log.Printf("[%d] Rate limited (connections): %s", connID, sess.remoteIP)
		sess.sendEvent(MsgConnectError, connID, []byte("daily connection limit exceeded"))
		return
	}

	// Create connection
	conn := &Connection{
		id:       connID,
		sockType: sockType,
	}
	sess.connections.Store(connID, conn)

	// Dial in goroutine
	go func() {
		var netConn net.Conn
		var err error

		if sockType == SOCK_STREAM {
			netConn, err = net.DialTimeout("tcp", addr, 10*time.Second)
		} else {
			netConn, err = net.Dial("udp", addr)
		}

		if err != nil {
			log.Printf("[%d] Connect failed: %v", connID, err)
			sess.sendEvent(MsgConnectError, connID, []byte(err.Error()))
			sess.connections.Delete(connID)
			return
		}

		conn.mu.Lock()
		if conn.closed.Load() {
			netConn.Close()
			conn.mu.Unlock()
			return
		}
		conn.conn = netConn
		conn.mu.Unlock()

		log.Printf("[%d] Connected to %s", connID, addr)
		sess.sendEvent(MsgConnected, connID, nil)

		// Start reading from connection
		go sess.readLoop(conn)
	}()
}

func (sess *Session) handleBind(stream webtransport.Stream) {
	// Read: connID (4), sockType (1), port (2)
	var header [4 + 1 + 2]byte
	if _, err := io.ReadFull(stream, header[:]); err != nil {
		log.Printf("Bind: failed to read header: %v", err)
		return
	}

	connID := binary.BigEndian.Uint32(header[0:4])
	sockType := int(header[4])
	port := binary.BigEndian.Uint16(header[5:7])

	addr := fmt.Sprintf(":%d", port)
	log.Printf("[%d] Bind to %s (type=%d)", connID, addr, sockType)

	conn := &Connection{
		id:       connID,
		sockType: sockType,
	}

	var err error
	if sockType == SOCK_STREAM {
		conn.listener, err = net.Listen("tcp", addr)
	} else {
		conn.udpConn, err = net.ListenUDP("udp", &net.UDPAddr{Port: int(port)})
	}

	if err != nil {
		log.Printf("[%d] Bind failed: %v", connID, err)
		sess.sendEvent(MsgError, connID, []byte(err.Error()))
		return
	}

	sess.connections.Store(connID, conn)
	sess.sendEvent(MsgConnected, connID, nil) // Bound successfully
}

func (sess *Session) handleListen(stream webtransport.Stream) {
	// Read: connID (4), backlog (4)
	var header [8]byte
	if _, err := io.ReadFull(stream, header[:]); err != nil {
		log.Printf("Listen: failed to read header: %v", err)
		return
	}

	connID := binary.BigEndian.Uint32(header[0:4])

	v, ok := sess.connections.Load(connID)
	if !ok {
		log.Printf("[%d] Listen: connection not found", connID)
		return
	}
	conn := v.(*Connection)

	if conn.listener == nil {
		log.Printf("[%d] Listen: not a listening socket", connID)
		return
	}

	log.Printf("[%d] Listening for connections", connID)

	// Accept incoming connections
	go func() {
		for {
			netConn, err := conn.listener.Accept()
			if err != nil {
				if conn.closed.Load() {
					return
				}
				log.Printf("[%d] Accept error: %v", connID, err)
				continue
			}

			// Create new connection for the accepted socket
			newConnID := sess.nextConnID.Add(1)
			newConn := &Connection{
				id:       newConnID,
				sockType: SOCK_STREAM,
				conn:     netConn,
			}
			sess.connections.Store(newConnID, newConn)

			remoteAddr := netConn.RemoteAddr().String()
			log.Printf("[%d] Accepted connection from %s -> new conn %d", connID, remoteAddr, newConnID)

			// Notify container of new connection
			// Format: listenerConnID (4), newConnID (4), addrLen (2), addr
			addrBytes := []byte(remoteAddr)
			payload := make([]byte, 4+4+2+len(addrBytes))
			binary.BigEndian.PutUint32(payload[0:4], connID)
			binary.BigEndian.PutUint32(payload[4:8], newConnID)
			binary.BigEndian.PutUint16(payload[8:10], uint16(len(addrBytes)))
			copy(payload[10:], addrBytes)

			sess.sendEvent(MsgAccept, newConnID, payload)

			// Start reading from new connection
			go sess.readLoop(newConn)
		}
	}()
}

func (sess *Session) handleSend(stream webtransport.Stream) {
	// Read: connID (4), dataLen (4), data
	var header [8]byte
	if _, err := io.ReadFull(stream, header[:]); err != nil {
		log.Printf("Send: failed to read header: %v", err)
		return
	}

	connID := binary.BigEndian.Uint32(header[0:4])
	dataLen := binary.BigEndian.Uint32(header[4:8])

	data := make([]byte, dataLen)
	if _, err := io.ReadFull(stream, data); err != nil {
		log.Printf("Send: failed to read data: %v", err)
		return
	}

	v, ok := sess.connections.Load(connID)
	if !ok {
		return
	}
	conn := v.(*Connection)

	conn.mu.Lock()
	netConn := conn.conn
	conn.mu.Unlock()

	if netConn == nil {
		return
	}

	if _, err := netConn.Write(data); err != nil {
		log.Printf("[%d] Send error: %v", connID, err)
	}
}

func (sess *Session) handleClose(stream webtransport.Stream) {
	// Read: connID (4)
	var header [4]byte
	if _, err := io.ReadFull(stream, header[:]); err != nil {
		return
	}

	connID := binary.BigEndian.Uint32(header[0:4])
	log.Printf("[%d] Close", connID)

	if v, ok := sess.connections.LoadAndDelete(connID); ok {
		conn := v.(*Connection)
		conn.Close()
	}

	sess.sendEvent(MsgClosed, connID, nil)
}

func (sess *Session) readLoop(conn *Connection) {
	buf := make([]byte, 65536)

	for {
		if conn.closed.Load() {
			return
		}

		conn.mu.Lock()
		netConn := conn.conn
		conn.mu.Unlock()

		if netConn == nil {
			return
		}

		netConn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		n, err := netConn.Read(buf)

		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			if err == io.EOF || conn.closed.Load() {
				sess.sendEvent(MsgClosed, conn.id, nil)
				return
			}
			log.Printf("[%d] Read error: %v", conn.id, err)
			sess.sendEvent(MsgClosed, conn.id, nil)
			return
		}

		if n > 0 {
			data := make([]byte, n)
			copy(data, buf[:n])
			sess.sendEvent(MsgData, conn.id, data)
		}
	}
}


func (sess *Session) sendEvent(msgType byte, connID uint32, data []byte) {
	sess.streamMu.Lock()
	defer sess.streamMu.Unlock()

	stream, err := sess.wt.OpenUniStream()
	if err != nil {
		log.Printf("Failed to open stream for event: %v", err)
		return
	}
	defer stream.Close()

	// Write: msgType (1), connID (4), dataLen (4), data
	header := make([]byte, 1+4+4)
	header[0] = msgType
	binary.BigEndian.PutUint32(header[1:5], connID)
	binary.BigEndian.PutUint32(header[5:9], uint32(len(data)))

	stream.Write(header)
	if len(data) > 0 {
		stream.Write(data)
	}
}

func (c *Connection) Close() {
	if c.closed.Swap(true) {
		return // Already closed
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		c.conn.Close()
	}
	if c.listener != nil {
		c.listener.Close()
	}
	if c.udpConn != nil {
		c.udpConn.Close()
	}
}

// isPrivateAddr checks if a host resolves to a private/loopback address (SSRF protection)
func isPrivateAddr(host string) bool {
	ips, err := net.LookupIP(host)
	if err != nil {
		// If we can't resolve, allow (the connection will fail naturally)
		return false
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return true
		}
	}
	return false
}

// --- Docker Pull API (HTTPS on :4434) ---

func (s *Server) RunAPIServer(apiListen string) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/pull", s.handleDockerPull)
	mux.HandleFunc("/search", s.handleDockerSearch)

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write([]byte("ok"))
	})

	tlsCert, err := tls.LoadX509KeyPair(s.certFile, s.keyFile)
	if err != nil {
		return fmt.Errorf("API server TLS: %w", err)
	}

	srv := &http.Server{
		Addr:    apiListen,
		Handler: mux,
		TLSConfig: &tls.Config{
			Certificates: []tls.Certificate{tlsCert},
		},
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 10 * time.Minute, // large images take time to stream
	}

	log.Printf("API server listening on https://0.0.0.0%s", apiListen)
	return srv.ListenAndServeTLS("", "")
}

func (s *Server) corsHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Length, X-Image-Name")
}

func (s *Server) handleDockerPull(w http.ResponseWriter, r *http.Request) {
	s.corsHeaders(w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	imageRef := r.URL.Query().Get("image")
	if imageRef == "" {
		http.Error(w, "missing ?image= parameter", http.StatusBadRequest)
		return
	}

	// Validate image reference
	ref, err := name.ParseReference(imageRef)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid image reference: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("[API] Pull request: %s", ref.String())

	// Rate limit: reuse connection rate limiter
	remoteIP := r.RemoteAddr
	if !s.rateLimiter.TryConnection(remoteIP) {
		http.Error(w, "daily pull limit exceeded", http.StatusTooManyRequests)
		return
	}

	// Try riscv64 first, fall back to amd64
	platform := v1.Platform{Architecture: "riscv64", OS: "linux"}
	img, err := remote.Image(ref, remote.WithPlatform(platform))
	if err != nil {
		log.Printf("[API] riscv64 not available for %s, trying amd64: %v", imageRef, err)
		platform = v1.Platform{Architecture: "amd64", OS: "linux"}
		img, err = remote.Image(ref, remote.WithPlatform(platform))
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to pull image: %v", err), http.StatusInternalServerError)
			return
		}
	}

	log.Printf("[API] Pulled %s (%s), exporting as tar...", imageRef, platform.Architecture)

	w.Header().Set("Content-Type", "application/x-tar")
	w.Header().Set("X-Image-Name", imageRef)
	w.Header().Set("X-Image-Arch", platform.Architecture)

	// Export flattened filesystem as tar directly to response
	if err := crane.Export(img, w); err != nil {
		log.Printf("[API] Export error for %s: %v", imageRef, err)
		// Can't set status code after streaming started
		return
	}

	log.Printf("[API] Finished exporting %s", imageRef)
}

func (s *Server) handleDockerSearch(w http.ResponseWriter, r *http.Request) {
	s.corsHeaders(w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		http.Error(w, "missing ?q= parameter", http.StatusBadRequest)
		return
	}

	// Proxy Docker Hub search API
	url := fmt.Sprintf("https://hub.docker.com/v2/search/repositories/?query=%s&page_size=20", q)
	resp, err := http.Get(url)
	if err != nil {
		http.Error(w, fmt.Sprintf("search failed: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

// byteReader wraps an io.Reader to implement io.ByteReader
type byteReader struct {
	io.Reader
}

func (b byteReader) ReadByte() (byte, error) {
	var buf [1]byte
	_, err := b.Read(buf[:])
	return buf[0], err
}

func main() {
	listen := flag.String("listen", ":4433", "Address to listen on")
	certFile := flag.String("cert", "cert.pem", "TLS certificate file")
	keyFile := flag.String("key", "key.pem", "TLS key file")
	maxSessions := flag.Int("max-sessions", 3, "Max concurrent sessions per IP")
	maxConns := flag.Int("max-conns", 100, "Max outbound connections per IP per day")
	origins := flag.String("origins", "", "Comma-separated allowed origins (empty = allow all)")
	flag.Parse()

	rl := NewRateLimiter(*maxSessions, *maxConns)

	var originList []string
	if *origins != "" {
		for _, o := range strings.Split(*origins, ",") {
			originList = append(originList, strings.TrimSpace(o))
		}
	}

	server := NewServer(*listen, *certFile, *keyFile, rl, originList)

	// Start API server (Docker pull) on :4434 in background
	go func() {
		if err := server.RunAPIServer(":4434"); err != nil {
			log.Fatalf("API server failed: %v", err)
		}
	}()

	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
