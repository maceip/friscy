#include <lkl_host.h>
#include <emscripten.h>

// Minimal stub for network bridge over WebTransport
// Designed to drop/ignore packets until full implementation
static int net_tx(struct lkl_netdev *nd, struct iovec *iov, int cnt) {
    // Drop packets silently, but return 0 to indicate 0 bytes were actually transmitted over the wire
    // to avoid TCP retransmit storms indicating success when dropped.
    return 0; 
}

static int net_rx(struct lkl_netdev *nd, struct iovec *iov, int cnt) {
    return 0; // No packets available
}

static int net_poll(struct lkl_netdev *nd) {
    return 0; // No events
}

static void net_poll_hup(struct lkl_netdev *nd) {
}

static void net_free(struct lkl_netdev *nd) {
}

struct lkl_dev_net_ops webtransport_net_ops = {
    .tx = net_tx,
    .rx = net_rx,
    .poll = net_poll,
    .poll_hup = net_poll_hup,
    .free = net_free,
};
