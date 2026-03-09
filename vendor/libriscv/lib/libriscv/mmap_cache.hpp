#include <array>
#include <cstdint>
#include <algorithm>
#include <map>
#include <vector>
#include "types.hpp"

namespace riscv
{
	template <int W>
	struct MMapCache
	{
		using address_t = address_type<W>;

		struct Range {
			address_t addr = 0x0;
			address_t size = 0u;

			constexpr bool empty() const noexcept { return size == 0u; }
			constexpr address_t end() const noexcept { return addr + size; }
			constexpr bool overlaps(address_t mem, address_t memsize) const noexcept {
				const address_t mem_end = mem + memsize;
				return addr < mem_end && mem < end();
			}
			constexpr bool equals(address_t mem, address_t memsize) const noexcept {
				return (this->addr == mem) && (this->addr + this->size == mem + memsize);
			}
		};

		Range find(address_t size)
		{
			auto best_it = m_by_size.lower_bound(size);
			if (best_it != m_by_size.end()) {
				const address_t addr = best_it->second;
				auto addr_it = m_by_addr.find(addr);
				if (addr_it == m_by_addr.end()) {
					m_by_size.erase(best_it);
					return Range{};
				}

				const Range r = addr_it->second;
				remove_by_addr(addr_it);

				const Range result { r.addr, size };
				if (r.size > size) {
					insert_range(r.addr + size, r.size - size);
				}
				return result;
			}
			return Range{};
		}

		void invalidate(address_t addr, address_t size)
		{
			if (size == 0) return;
			const address_t start = addr;
			const address_t end = addr + size;

			auto it = m_by_addr.lower_bound(start);
			if (it != m_by_addr.begin()) {
				--it;
			}

			std::vector<Range> survivors;
			while (it != m_by_addr.end())
			{
				const Range current = it->second;
				if (current.addr >= end) break;
				if (!current.overlaps(start, size)) {
					++it;
					continue;
				}

				if (current.addr < start) {
					survivors.push_back(Range { current.addr, start - current.addr });
				}
				if (current.end() > end) {
					survivors.push_back(Range { end, current.end() - end });
				}

				auto erase_it = it++;
				remove_by_addr(erase_it);
			}

			for (const auto& survivor : survivors) {
				insert_range(survivor.addr, survivor.size);
			}
		}

		void insert(address_t addr, address_t size)
		{
			if (size == 0) return;
			address_t start = addr;
			address_t end = addr + size;

			auto it = m_by_addr.lower_bound(start);
			if (it != m_by_addr.begin()) {
				--it;
			}

			while (it != m_by_addr.end())
			{
				const auto current = it->second;
				const address_t rstart = current.addr;
				const address_t rend = current.end();
				if (rend < start) {
					++it;
					continue;
				}
				if (rstart > end) {
					break;
				}
				start = std::min(start, rstart);
				end = std::max(end, rend);
				auto erase_it = it++;
				remove_by_addr(erase_it);
			}

			insert_range(start, end - start);
		}

	private:
		using AddrMap = std::map<address_t, Range>;
		using SizeMap = std::multimap<address_t, address_t>;

		void remove_by_addr(typename AddrMap::iterator it)
		{
			const address_t addr = it->second.addr;
			const address_t size = it->second.size;
			auto [begin, end] = m_by_size.equal_range(size);
			for (auto sz_it = begin; sz_it != end; ++sz_it) {
				if (sz_it->second == addr) {
					m_by_size.erase(sz_it);
					break;
				}
			}
			m_by_addr.erase(it);
		}

		void insert_range(address_t addr, address_t size)
		{
			if (size == 0) return;
			m_by_addr.insert_or_assign(addr, Range { addr, size });
			m_by_size.emplace(size, addr);
		}

		AddrMap m_by_addr {};
		SizeMap m_by_size {};
	};

} // riscv
