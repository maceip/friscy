// host_proxy - WebSocket bridge to real network for friscy
//
// This runs on the host and provides network access to browser-based friscy
// instances via WebSocket. Uses gvisor's userspace network stack.
//
// Usage:
//   go run main.go -listen :8765
//
// The browser-side network_bridge.js connects to this proxy.

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Message types matching network_bridge.js
const (
	MsgSocketCreate  = 0x01
	MsgSocketConnect = 0x02
	MsgSocketBind    = 0x03
	MsgSocketListen  = 0x04
	MsgSocketAccept  = 0x05
	MsgSocketSend    = 0x06
	MsgSocketClose   = 0x07

	MsgConnectOK   = 0x81
	MsgConnectFail = 0x82
	MsgData        = 0x83
	MsgAcceptNew   = 0x84
	MsgClosed      = 0x85
	MsgError       = 0x86
)

// Socket types
const (
	SockStream = 1 // TCP
	SockDgram  = 2 // UDP
)

// Message from browser
type InMessage struct {
	Type     int    `json:"type"`
	FD       int    `json:"fd"`
	Domain   int    `json:"domain,omitempty"`
	SockType int    `json:"sockType,omitempty"`
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Data     []byte `json:"data,omitempty"`
	Backlog  int    `json:"backlog,omitempty"`
	How      int    `json:"how,omitempty"`
}

// Message to browser
type OutMessage struct {
	Type    int    `json:"type"`
	FD      int    `json:"fd"`
	Error   int    `json:"error,omitempty"`
	Data    []byte `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
}

// Virtual socket state
type VSocket struct {
	fd       int
	sockType int
	conn     net.Conn
	listener net.Listener
	closed   bool
	mu       sync.Mutex
}

// Client session
type Session struct {
	ws      *websocket.Conn
	sockets map[int]*VSocket
	mu      sync.RWMutex
	wsMu    sync.Mutex
}

func newSession(ws *websocket.Conn) *Session {
	return &Session{
		ws:      ws,
		sockets: make(map[int]*VSocket),
	}
}

func (s *Session) send(msg OutMessage) error {
	s.wsMu.Lock()
	defer s.wsMu.Unlock()
	return s.ws.WriteJSON(msg)
}

func (s *Session) getSocket(fd int) *VSocket {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sockets[fd]
}

func (s *Session) addSocket(fd int, sock *VSocket) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sockets[fd] = sock
}

func (s *Session) removeSocket(fd int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sock, ok := s.sockets[fd]; ok {
		sock.mu.Lock()
		sock.closed = true
		if sock.conn != nil {
			sock.conn.Close()
		}
		if sock.listener != nil {
			sock.listener.Close()
		}
		sock.mu.Unlock()
		delete(s.sockets, fd)
	}
}

func (s *Session) handleMessage(msg InMessage) {
	switch msg.Type {
	case MsgSocketCreate:
		s.handleCreate(msg)
	case MsgSocketConnect:
		s.handleConnect(msg)
	case MsgSocketBind:
		s.handleBind(msg)
	case MsgSocketListen:
		s.handleListen(msg)
	case MsgSocketSend:
		s.handleSend(msg)
	case MsgSocketClose:
		s.handleClose(msg)
	}
}

func (s *Session) handleCreate(msg InMessage) {
	sock := &VSocket{
		fd:       msg.FD,
		sockType: msg.SockType,
	}
	s.addSocket(msg.FD, sock)
	log.Printf("[%d] Socket created (type=%d)", msg.FD, msg.SockType)
}

func (s *Session) handleConnect(msg InMessage) {
	sock := s.getSocket(msg.FD)
	if sock == nil {
		s.send(OutMessage{Type: MsgConnectFail, FD: msg.FD, Error: -88})
		return
	}

	addr := fmt.Sprintf("%s:%d", msg.Host, msg.Port)
	log.Printf("[%d] Connecting to %s", msg.FD, addr)

	go func() {
		var conn net.Conn
		var err error

		if sock.sockType == SockStream {
			conn, err = net.DialTimeout("tcp", addr, 10*time.Second)
		} else {
			conn, err = net.Dial("udp", addr)
		}

		if err != nil {
			log.Printf("[%d] Connect failed: %v", msg.FD, err)
			s.send(OutMessage{Type: MsgConnectFail, FD: msg.FD, Error: -111})
			return
		}

		sock.mu.Lock()
		if sock.closed {
			conn.Close()
			sock.mu.Unlock()
			return
		}
		sock.conn = conn
		sock.mu.Unlock()

		log.Printf("[%d] Connected to %s", msg.FD, addr)
		s.send(OutMessage{Type: MsgConnectOK, FD: msg.FD})

		// Start reading from connection
		go s.readLoop(msg.FD, sock)
	}()
}

func (s *Session) handleBind(msg InMessage) {
	sock := s.getSocket(msg.FD)
	if sock == nil {
		return
	}

	addr := fmt.Sprintf(":%d", msg.Port)
	log.Printf("[%d] Bind to %s", msg.FD, addr)

	var err error
	if sock.sockType == SockStream {
		sock.listener, err = net.Listen("tcp", addr)
	} else {
		sock.conn, err = net.ListenPacket("udp", addr).(net.Conn)
	}

	if err != nil {
		log.Printf("[%d] Bind failed: %v", msg.FD, err)
		s.send(OutMessage{Type: MsgError, FD: msg.FD, Message: err.Error()})
	}
}

func (s *Session) handleListen(msg InMessage) {
	sock := s.getSocket(msg.FD)
	if sock == nil || sock.listener == nil {
		return
	}

	log.Printf("[%d] Listening", msg.FD)

	go func() {
		for {
			conn, err := sock.listener.Accept()
			if err != nil {
				if sock.closed {
					return
				}
				log.Printf("[%d] Accept error: %v", msg.FD, err)
				continue
			}

			// For now, we just track the first connection
			// A full implementation would create new FDs
			sock.mu.Lock()
			sock.conn = conn
			sock.mu.Unlock()

			s.send(OutMessage{Type: MsgAcceptNew, FD: msg.FD})
			go s.readLoop(msg.FD, sock)
		}
	}()
}

func (s *Session) handleSend(msg InMessage) {
	sock := s.getSocket(msg.FD)
	if sock == nil || sock.conn == nil {
		return
	}

	sock.mu.Lock()
	conn := sock.conn
	sock.mu.Unlock()

	if conn == nil {
		return
	}

	_, err := conn.Write(msg.Data)
	if err != nil {
		log.Printf("[%d] Send error: %v", msg.FD, err)
	}
}

func (s *Session) handleClose(msg InMessage) {
	log.Printf("[%d] Close", msg.FD)
	s.removeSocket(msg.FD)
	s.send(OutMessage{Type: MsgClosed, FD: msg.FD})
}

func (s *Session) readLoop(fd int, sock *VSocket) {
	buf := make([]byte, 65536)

	for {
		sock.mu.Lock()
		conn := sock.conn
		closed := sock.closed
		sock.mu.Unlock()

		if closed || conn == nil {
			return
		}

		conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		n, err := conn.Read(buf)

		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			if err == io.EOF || sock.closed {
				s.send(OutMessage{Type: MsgClosed, FD: fd})
				return
			}
			log.Printf("[%d] Read error: %v", fd, err)
			s.send(OutMessage{Type: MsgClosed, FD: fd})
			return
		}

		if n > 0 {
			data := make([]byte, n)
			copy(data, buf[:n])
			s.send(OutMessage{Type: MsgData, FD: fd, Data: data})
		}
	}
}

func (s *Session) close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for fd, sock := range s.sockets {
		sock.mu.Lock()
		sock.closed = true
		if sock.conn != nil {
			sock.conn.Close()
		}
		if sock.listener != nil {
			sock.listener.Close()
		}
		sock.mu.Unlock()
		delete(s.sockets, fd)
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	log.Printf("New client connected from %s", r.RemoteAddr)

	session := newSession(ws)
	defer session.close()

	for {
		var msg InMessage
		err := ws.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		session.handleMessage(msg)
	}

	log.Printf("Client disconnected from %s", r.RemoteAddr)
}

func main() {
	listen := flag.String("listen", ":8765", "Address to listen on")
	flag.Parse()

	http.HandleFunc("/", handleWebSocket)

	log.Printf("friscy network proxy listening on %s", *listen)
	log.Printf("Connect from browser with: ws://localhost%s", *listen)

	if err := http.ListenAndServe(*listen, nil); err != nil {
		log.Fatal(err)
	}
}
