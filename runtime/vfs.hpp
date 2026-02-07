// vfs.hpp - Virtual File System for libriscv container emulation
// Provides filesystem access to container rootfs from tar archive
#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>
#include <unordered_map>
#include <memory>
#include <algorithm>

namespace vfs {

// File types (matching Linux stat mode)
enum class FileType : uint16_t {
    Regular    = 0100000,
    Directory  = 0040000,
    Symlink    = 0120000,
    CharDev    = 0020000,
    BlockDev   = 0060000,
    Fifo       = 0010000,
    Socket     = 0140000,
};

// A file/directory entry in the VFS
struct Entry {
    std::string name;
    FileType type;
    uint32_t mode;        // Permission bits
    uint32_t uid;
    uint32_t gid;
    uint64_t size;
    uint64_t mtime;
    std::string link_target;  // For symlinks

    // File content (for regular files)
    std::vector<uint8_t> content;

    // Children (for directories)
    std::unordered_map<std::string, std::shared_ptr<Entry>> children;

    bool is_dir() const { return type == FileType::Directory; }
    bool is_file() const { return type == FileType::Regular; }
    bool is_symlink() const { return type == FileType::Symlink; }
};

// Open file handle
struct FileHandle {
    std::shared_ptr<Entry> entry;
    uint64_t offset;
    int flags;
    std::string path;  // For debugging

    FileHandle(std::shared_ptr<Entry> e, int f, const std::string& p)
        : entry(e), offset(0), flags(f), path(p) {}
};

// Directory listing state
struct DirHandle {
    std::shared_ptr<Entry> entry;
    std::vector<std::string> names;
    size_t index;
    std::string path;

    DirHandle(std::shared_ptr<Entry> e, const std::string& p)
        : entry(e), index(0), path(p) {
        for (const auto& [name, _] : e->children) {
            names.push_back(name);
        }
        std::sort(names.begin(), names.end());
    }
};

class VirtualFS {
public:
    VirtualFS() {
        // Create root directory
        root_ = std::make_shared<Entry>();
        root_->name = "";
        root_->type = FileType::Directory;
        root_->mode = 0755;
        cwd_ = "/";
    }

    // Load from tar archive in memory
    bool load_tar(const uint8_t* data, size_t size) {
        size_t offset = 0;

        while (offset + 512 <= size) {
            // TAR header is 512 bytes
            const uint8_t* header = data + offset;

            // Check for end-of-archive (two zero blocks)
            bool all_zero = true;
            for (int i = 0; i < 512 && all_zero; i++) {
                if (header[i] != 0) all_zero = false;
            }
            if (all_zero) break;

            // Parse header
            std::string name(reinterpret_cast<const char*>(header), 100);
            name = name.c_str();  // Trim at null

            // Handle long names (GNU tar format)
            if (name == "././@LongLink") {
                // Next block contains the long name
                offset += 512;
                size_t name_len = parse_octal(header + 124, 12);
                size_t name_blocks = (name_len + 511) / 512;
                name = std::string(reinterpret_cast<const char*>(data + offset), name_len);
                name = name.c_str();  // Trim at null
                offset += name_blocks * 512;
                header = data + offset;
            }

            // UStar prefix
            if (memcmp(header + 257, "ustar", 5) == 0) {
                std::string prefix(reinterpret_cast<const char*>(header + 345), 155);
                prefix = prefix.c_str();
                if (!prefix.empty()) {
                    name = prefix + "/" + name;
                }
            }

            // Skip ./ prefix
            if (name.starts_with("./")) {
                name = name.substr(2);
            }
            if (name.empty()) {
                offset += 512;
                continue;
            }

            // Parse fields
            uint32_t mode = parse_octal(header + 100, 8);
            uint32_t uid = parse_octal(header + 108, 8);
            uint32_t gid = parse_octal(header + 116, 8);
            uint64_t file_size = parse_octal(header + 124, 12);
            uint64_t mtime = parse_octal(header + 136, 12);
            char type_flag = header[156];

            // Link target for symlinks
            std::string link_target(reinterpret_cast<const char*>(header + 157), 100);
            link_target = link_target.c_str();

            // Determine file type
            FileType type;
            switch (type_flag) {
                case '0': case '\0':
                    type = FileType::Regular;
                    break;
                case '1':  // Hard link (treat as regular file, copy content later)
                    type = FileType::Regular;
                    break;
                case '2':
                    type = FileType::Symlink;
                    break;
                case '3':
                    type = FileType::CharDev;
                    break;
                case '4':
                    type = FileType::BlockDev;
                    break;
                case '5':
                    type = FileType::Directory;
                    break;
                case '6':
                    type = FileType::Fifo;
                    break;
                default:
                    type = FileType::Regular;
            }

            // Create entry
            auto entry = std::make_shared<Entry>();
            entry->name = name.substr(name.rfind('/') + 1);
            if (entry->name.empty() && type == FileType::Directory) {
                entry->name = name;
            }
            entry->type = type;
            entry->mode = mode;
            entry->uid = uid;
            entry->gid = gid;
            entry->size = file_size;
            entry->mtime = mtime;
            entry->link_target = link_target;

            // Move to content
            offset += 512;

            // Read file content
            if (type == FileType::Regular && file_size > 0) {
                if (offset + file_size > size) break;
                entry->content.assign(data + offset, data + offset + file_size);
                offset += ((file_size + 511) / 512) * 512;  // Round up to block
            }

            // Insert into VFS tree
            insert_entry("/" + name, entry);
        }

        return true;
    }

    // Resolve a path (following symlinks up to max_depth times)
    std::shared_ptr<Entry> resolve(const std::string& path, int max_depth = 16) {
        std::string abs_path = make_absolute(path);

        // Split path into components
        std::vector<std::string> parts;
        size_t start = 1;
        while (start < abs_path.size()) {
            size_t end = abs_path.find('/', start);
            if (end == std::string::npos) end = abs_path.size();
            if (end > start) {
                parts.push_back(abs_path.substr(start, end - start));
            }
            start = end + 1;
        }

        // Traverse
        auto current = root_;
        std::string current_path = "";

        for (size_t i = 0; i < parts.size(); i++) {
            const auto& part = parts[i];

            if (!current || !current->is_dir()) {
                return nullptr;  // Not a directory
            }

            if (part == ".") {
                continue;
            } else if (part == "..") {
                // Go up - find parent
                size_t last_slash = current_path.rfind('/');
                if (last_slash != std::string::npos) {
                    current_path = current_path.substr(0, last_slash);
                    current = resolve_no_symlink(current_path.empty() ? "/" : current_path);
                }
                continue;
            }

            auto it = current->children.find(part);
            if (it == current->children.end()) {
                return nullptr;  // Not found
            }

            current = it->second;
            current_path += "/" + part;

            // Handle symlinks
            if (current->is_symlink() && max_depth > 0) {
                std::string target = current->link_target;
                if (!target.starts_with("/")) {
                    // Relative symlink
                    size_t last_slash = current_path.rfind('/');
                    if (last_slash != std::string::npos) {
                        target = current_path.substr(0, last_slash) + "/" + target;
                    }
                }

                // Resolve the symlink target + remaining path
                std::string remaining;
                for (size_t j = i + 1; j < parts.size(); j++) {
                    remaining += "/" + parts[j];
                }

                return resolve(target + remaining, max_depth - 1);
            }
        }

        return current;
    }

    // Stat a path
    bool stat(const std::string& path, Entry& out) {
        auto entry = resolve(path);
        if (!entry) return false;
        out = *entry;
        return true;
    }

    // Lstat (don't follow final symlink)
    bool lstat(const std::string& path, Entry& out) {
        auto entry = resolve_no_symlink(path);
        if (!entry) return false;
        out = *entry;
        return true;
    }

    // Open a file
    int open(const std::string& path, int flags) {
        auto entry = resolve(path);
        if (!entry) {
            // TODO: Create file if O_CREAT
            return -2;  // ENOENT
        }

        if (entry->is_dir()) {
            return -21;  // EISDIR
        }

        int fd = next_fd_++;
        open_files_[fd] = std::make_unique<FileHandle>(entry, flags, path);
        return fd;
    }

    // Open a directory
    int opendir(const std::string& path) {
        auto entry = resolve(path);
        if (!entry) return -2;  // ENOENT
        if (!entry->is_dir()) return -20;  // ENOTDIR

        int fd = next_fd_++;
        open_dirs_[fd] = std::make_unique<DirHandle>(entry, path);
        return fd;
    }

    // Close
    void close(int fd) {
        open_files_.erase(fd);
        open_dirs_.erase(fd);
    }

    // Read from file
    ssize_t read(int fd, void* buf, size_t count) {
        auto it = open_files_.find(fd);
        if (it == open_files_.end()) return -9;  // EBADF

        auto& fh = it->second;
        if (!fh->entry->is_file()) return -21;  // EISDIR

        size_t available = fh->entry->content.size() - fh->offset;
        size_t to_read = std::min(count, available);

        memcpy(buf, fh->entry->content.data() + fh->offset, to_read);
        fh->offset += to_read;

        return static_cast<ssize_t>(to_read);
    }

    // Write to file (in-memory only, for writable mounts)
    ssize_t write(int fd, const void* buf, size_t count) {
        auto it = open_files_.find(fd);
        if (it == open_files_.end()) return -9;  // EBADF

        auto& fh = it->second;
        if (!fh->entry->is_file()) return -21;

        // Extend if needed
        size_t end_pos = fh->offset + count;
        if (end_pos > fh->entry->content.size()) {
            fh->entry->content.resize(end_pos);
            fh->entry->size = end_pos;
        }

        memcpy(fh->entry->content.data() + fh->offset, buf, count);
        fh->offset += count;

        return static_cast<ssize_t>(count);
    }

    // Seek
    off_t lseek(int fd, off_t offset, int whence) {
        auto it = open_files_.find(fd);
        if (it == open_files_.end()) return -9;

        auto& fh = it->second;
        int64_t new_offset;

        switch (whence) {
            case 0:  // SEEK_SET
                new_offset = offset;
                break;
            case 1:  // SEEK_CUR
                new_offset = fh->offset + offset;
                break;
            case 2:  // SEEK_END
                new_offset = fh->entry->size + offset;
                break;
            default:
                return -22;  // EINVAL
        }

        if (new_offset < 0) return -22;
        fh->offset = new_offset;
        return fh->offset;
    }

    // Read directory entries (getdents64 format)
    ssize_t getdents64(int fd, void* buf, size_t count) {
        auto it = open_dirs_.find(fd);
        if (it == open_dirs_.end()) {
            // Try file map (some programs open dirs as files)
            auto fit = open_files_.find(fd);
            if (fit != open_files_.end() && fit->second->entry->is_dir()) {
                // Convert to dir handle
                open_dirs_[fd] = std::make_unique<DirHandle>(
                    fit->second->entry, fit->second->path);
                open_files_.erase(fd);
                return getdents64(fd, buf, count);
            }
            return -9;  // EBADF
        }

        auto& dh = it->second;
        uint8_t* out = static_cast<uint8_t*>(buf);
        size_t written = 0;

        while (dh->index < dh->names.size()) {
            const auto& name = dh->names[dh->index];
            auto entry = dh->entry->children[name];

            // Calculate record size (d_ino + d_off + d_reclen + d_type + name + null)
            size_t reclen = 8 + 8 + 2 + 1 + name.size() + 1;
            reclen = (reclen + 7) & ~7;  // Align to 8 bytes

            if (written + reclen > count) break;

            // Write dirent64 structure
            uint64_t d_ino = dh->index + 1;
            uint64_t d_off = dh->index + 1;
            uint16_t d_reclen = reclen;
            uint8_t d_type;

            switch (entry->type) {
                case FileType::Regular:   d_type = 8; break;  // DT_REG
                case FileType::Directory: d_type = 4; break;  // DT_DIR
                case FileType::Symlink:   d_type = 10; break; // DT_LNK
                case FileType::CharDev:   d_type = 2; break;  // DT_CHR
                case FileType::BlockDev:  d_type = 6; break;  // DT_BLK
                case FileType::Fifo:      d_type = 1; break;  // DT_FIFO
                case FileType::Socket:    d_type = 12; break; // DT_SOCK
                default:                  d_type = 0; break;  // DT_UNKNOWN
            }

            memcpy(out + written, &d_ino, 8);
            memcpy(out + written + 8, &d_off, 8);
            memcpy(out + written + 16, &d_reclen, 2);
            out[written + 18] = d_type;
            memcpy(out + written + 19, name.c_str(), name.size() + 1);

            written += reclen;
            dh->index++;
        }

        return static_cast<ssize_t>(written);
    }

    // Readlink
    ssize_t readlink(const std::string& path, char* buf, size_t bufsiz) {
        auto entry = resolve_no_symlink(path);
        if (!entry) return -2;
        if (!entry->is_symlink()) return -22;

        size_t len = std::min(entry->link_target.size(), bufsiz);
        memcpy(buf, entry->link_target.c_str(), len);
        return len;
    }

    // Getcwd
    std::string getcwd() const { return cwd_; }

    // Chdir
    bool chdir(const std::string& path) {
        auto entry = resolve(path);
        if (!entry || !entry->is_dir()) return false;
        cwd_ = make_absolute(path);
        return true;
    }

    // Add a file at runtime (for /proc, /dev emulation)
    void add_virtual_file(const std::string& path, const std::vector<uint8_t>& content) {
        auto entry = std::make_shared<Entry>();
        entry->type = FileType::Regular;
        entry->mode = 0444;
        entry->content = content;
        entry->size = content.size();
        insert_entry(path, entry);
    }

    void add_virtual_file(const std::string& path, const std::string& content) {
        add_virtual_file(path, std::vector<uint8_t>(content.begin(), content.end()));
    }

private:
    std::shared_ptr<Entry> root_;
    std::string cwd_;
    int next_fd_ = 3;  // 0, 1, 2 reserved for stdin/out/err
    std::unordered_map<int, std::unique_ptr<FileHandle>> open_files_;
    std::unordered_map<int, std::unique_ptr<DirHandle>> open_dirs_;

    static uint64_t parse_octal(const uint8_t* p, size_t len) {
        uint64_t val = 0;
        for (size_t i = 0; i < len && p[i] >= '0' && p[i] <= '7'; i++) {
            val = val * 8 + (p[i] - '0');
        }
        return val;
    }

    std::string make_absolute(const std::string& path) {
        if (path.empty()) return cwd_;
        if (path[0] == '/') return path;
        if (cwd_ == "/") return "/" + path;
        return cwd_ + "/" + path;
    }

    std::shared_ptr<Entry> resolve_no_symlink(const std::string& path) {
        std::string abs_path = make_absolute(path);
        if (abs_path == "/") return root_;

        std::vector<std::string> parts;
        size_t start = 1;
        while (start < abs_path.size()) {
            size_t end = abs_path.find('/', start);
            if (end == std::string::npos) end = abs_path.size();
            if (end > start) {
                parts.push_back(abs_path.substr(start, end - start));
            }
            start = end + 1;
        }

        auto current = root_;
        for (const auto& part : parts) {
            if (!current || !current->is_dir()) return nullptr;
            auto it = current->children.find(part);
            if (it == current->children.end()) return nullptr;
            current = it->second;
        }
        return current;
    }

    void insert_entry(const std::string& path, std::shared_ptr<Entry> entry) {
        std::string abs_path = path;
        if (!abs_path.starts_with("/")) abs_path = "/" + abs_path;

        // Remove trailing slash
        while (abs_path.size() > 1 && abs_path.back() == '/') {
            abs_path.pop_back();
        }

        // Split into parent path and name
        size_t last_slash = abs_path.rfind('/');
        std::string parent_path = abs_path.substr(0, last_slash);
        std::string name = abs_path.substr(last_slash + 1);

        if (parent_path.empty()) parent_path = "/";
        if (name.empty()) return;

        entry->name = name;

        // Create parent directories as needed
        std::shared_ptr<Entry> parent = root_;
        if (parent_path != "/") {
            std::vector<std::string> parts;
            size_t start = 1;
            while (start < parent_path.size()) {
                size_t end = parent_path.find('/', start);
                if (end == std::string::npos) end = parent_path.size();
                if (end > start) {
                    parts.push_back(parent_path.substr(start, end - start));
                }
                start = end + 1;
            }

            for (const auto& part : parts) {
                auto it = parent->children.find(part);
                if (it == parent->children.end()) {
                    auto dir = std::make_shared<Entry>();
                    dir->name = part;
                    dir->type = FileType::Directory;
                    dir->mode = 0755;
                    parent->children[part] = dir;
                    parent = dir;
                } else {
                    parent = it->second;
                }
            }
        }

        parent->children[name] = entry;
    }
};

}  // namespace vfs
