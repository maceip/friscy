#include "vfs.hpp"

#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

namespace {
constexpr int kOCreate = 0100;
constexpr int kOTrunc = 01000;
constexpr int kORdwr = 02;

bool write_file(vfs::VirtualFS& fs, const std::string& path, const std::string& data) {
    const int fd = fs.open(path, kOCreate | kOTrunc | kORdwr);
    if (fd < 0) return false;
    const auto wrote = fs.write(fd, data.data(), data.size());
    fs.close(fd);
    return wrote == static_cast<ssize_t>(data.size());
}

bool read_file(vfs::VirtualFS& fs, const std::string& path, std::string& out) {
    const int fd = fs.open(path, 0);
    if (fd < 0) return false;
    std::vector<char> buf(4096);
    const auto n = fs.read(fd, buf.data(), buf.size());
    fs.close(fd);
    if (n < 0) return false;
    out.assign(buf.data(), static_cast<size_t>(n));
    return true;
}

bool dir_contains(vfs::VirtualFS& fs, const std::string& path, const std::string& want_name) {
    const int dfd = fs.opendir(path);
    if (dfd < 0) return false;
    uint8_t buf[4096];
    bool found = false;
    for (;;) {
        const auto n = fs.getdents64(dfd, buf, sizeof(buf));
        if (n <= 0) break;
        size_t off = 0;
        while (off + 19 <= static_cast<size_t>(n)) {
            uint16_t reclen = 0;
            std::memcpy(&reclen, buf + off + 16, sizeof(reclen));
            if (reclen < 20 || off + reclen > static_cast<size_t>(n)) break;
            const char* name = reinterpret_cast<const char*>(buf + off + 19);
            if (want_name == name) {
                found = true;
                break;
            }
            off += reclen;
        }
        if (found) break;
    }
    fs.close(dfd);
    return found;
}

int fail(const std::string& msg) {
    std::cerr << "[vfs_overlay_selftest] FAIL: " << msg << "\n";
    return 1;
}
}  // namespace

int main() {
    vfs::VirtualFS fs;

    // Overlay-like mutation sequence over a base tree.
    if (fs.mkdir("/etc", 0755) != 0) return fail("mkdir /etc");
    if (fs.mkdir("/tmp", 0755) != 0) return fail("mkdir /tmp");
    if (!write_file(fs, "/etc/config.json", "{\"version\":1,\"mode\":\"base\"}")) {
        return fail("write base config");
    }
    if (!write_file(fs, "/tmp/scratch.txt", "scratch")) {
        return fail("write scratch");
    }
    if (fs.mkdir("/tmp/newdir", 0755) != 0) return fail("mkdir /tmp/newdir");
    if (fs.mkdir("/tmp/newdir/nested", 0755) != 0) return fail("mkdir /tmp/newdir/nested");
    if (!dir_contains(fs, "/tmp/newdir", "nested")) {
        return fail("opendir/getdents for newly-created directory");
    }
    // Path normalization regressions: ./ and trailing slash must resolve.
    if (!write_file(fs, "/etc/./norm.txt", "norm")) {
        return fail("write with ./ path");
    }
    std::string norm;
    if (!read_file(fs, "/etc/./norm.txt/", norm)) {
        return fail("read with ./ + trailing / path");
    }
    if (norm != "norm") {
        return fail("normalized path content mismatch");
    }

    // Simulate upper-layer edits: rename old config away, write new one, delete old.
    if (fs.rename("/etc/config.json", "/etc/config.json.bak") != 0) {
        return fail("rename config to backup");
    }
    if (!write_file(fs, "/etc/config.json", "{\"version\":2,\"mode\":\"overlay\"}")) {
        return fail("write overlay config");
    }
    if (fs.unlink("/etc/config.json.bak", 0) != 0) {
        return fail("unlink backup");
    }

    // Truncate and rewrite to verify mutation persistence.
    const int scratch_fd = fs.open("/tmp/scratch.txt", kORdwr);
    if (scratch_fd < 0) return fail("open scratch");
    if (fs.ftruncate(scratch_fd, 0) != 0) return fail("truncate scratch");
    const char* note = "post-truncate";
    if (fs.write(scratch_fd, note, std::strlen(note)) != static_cast<ssize_t>(std::strlen(note))) {
        return fail("rewrite scratch");
    }
    fs.close(scratch_fd);

    // Save and reload, validating the final visible tree.
    const auto tar = fs.save_tar();
    if (tar.empty()) return fail("save_tar returned empty archive");

    vfs::VirtualFS roundtrip;
    if (!roundtrip.load_tar(tar.data(), tar.size())) return fail("load_tar roundtrip");

    std::string config;
    if (!read_file(roundtrip, "/etc/config.json", config)) return fail("read roundtrip config");
    if (config != "{\"version\":2,\"mode\":\"overlay\"}") {
        return fail("roundtrip config content mismatch");
    }

    std::string backup;
    if (read_file(roundtrip, "/etc/config.json.bak", backup)) {
        return fail("backup file should have been removed");
    }

    std::string scratch;
    if (!read_file(roundtrip, "/tmp/scratch.txt", scratch)) return fail("read roundtrip scratch");
    if (scratch != "post-truncate") return fail("roundtrip scratch content mismatch");

    std::cout << "[vfs_overlay_selftest] PASS\n";
    return 0;
}
