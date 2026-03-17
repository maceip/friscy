#include <lkl_host.h>
#include <string.h>
#include <emscripten.h>

struct mem_disk {
    void *data;
    unsigned long long size;
};

static struct mem_disk root_mem_disk;
int lkl_disk_add(struct lkl_disk *disk);

static int mem_get_capacity(struct lkl_disk disk, unsigned long long *res) {
    struct mem_disk *md = (struct mem_disk *)disk.handle;
    if (!md) return -1;
    *res = md->size;
    return LKL_DEV_BLK_STATUS_OK;
}

static int mem_request(struct lkl_disk disk, struct lkl_blk_req *req) {
    struct mem_disk *md = (struct mem_disk *)disk.handle;
    if (!md) return LKL_DEV_BLK_STATUS_IOERR;

    unsigned long long offset;
    if (__builtin_mul_overflow(req->sector, 512, &offset)) {
        return LKL_DEV_BLK_STATUS_IOERR;
    }

    for (int i = 0; i < req->count; i++) {
        struct iovec *buf = &req->buf[i];
        unsigned long long end_offset;
        
        if (__builtin_add_overflow(offset, buf->iov_len, &end_offset) || end_offset > md->size) {
            return LKL_DEV_BLK_STATUS_IOERR;
        }

        switch (req->type) {
        case LKL_DEV_BLK_TYPE_READ:
            memcpy(buf->iov_base, (char *)md->data + offset, buf->iov_len);
            break;
        case LKL_DEV_BLK_TYPE_WRITE:
            memcpy((char *)md->data + offset, buf->iov_base, buf->iov_len);
            break;
        case LKL_DEV_BLK_TYPE_FLUSH:
        case LKL_DEV_BLK_TYPE_FLUSH_OUT:
            break;
        default:
            return LKL_DEV_BLK_STATUS_UNSUP;
        }
        offset += buf->iov_len;
    }
    return LKL_DEV_BLK_STATUS_OK;
}

struct lkl_dev_blk_ops mem_blk_ops = {
    .get_capacity = mem_get_capacity,
    .request = mem_request,
};

EMSCRIPTEN_KEEPALIVE
int kasm_set_root_disk(void *data, unsigned long long size) {
    root_mem_disk.data = data;
    root_mem_disk.size = size;
    return 0;
}

int kasm_root_disk_ready(void) {
    return root_mem_disk.data != NULL && root_mem_disk.size != 0;
}

int kasm_add_root_disk(void) {
    struct lkl_disk disk = {
        .handle = &root_mem_disk,
        .ops = &mem_blk_ops,
    };

    if (!kasm_root_disk_ready()) {
        return -1;
    }

    return lkl_disk_add(&disk);
}
