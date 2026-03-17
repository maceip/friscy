/**
 * Rootfs-backed executable loader.
 *
 * Uses the assembled rootfs tree as the source of truth for executable Wasm
 * modules until kernel-backed exec/load is wired through the real VFS path.
 */

function isAbsoluteExecutablePath(executable) {
    return typeof executable === 'string' && executable.startsWith('/');
}

function rootfsBuildUrlFor(executable) {
    const relativePath = executable.replace(/^\/+/, '');
    return new URL(`../rootfs/build/${relativePath}`, import.meta.url);
}

async function compileArrayBuffer(buffer) {
    return WebAssembly.compile(buffer);
}

async function loadFromNodeFilesystem(executable) {
    const { readFile } = await import('fs/promises');
    const url = rootfsBuildUrlFor(executable);
    const bytes = await readFile(url);
    return compileArrayBuffer(bytes);
}

async function loadFromBrowserFetch(executable) {
    const url = rootfsBuildUrlFor(executable);
    const response = await fetch(url.href);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url.href}`);
    }

    if (WebAssembly.compileStreaming) {
        try {
            return await WebAssembly.compileStreaming(fetch(url.href));
        } catch (err) {
            // Fall back to ArrayBuffer compile if the server MIME type is wrong.
        }
    }

    const buffer = await response.arrayBuffer();
    return compileArrayBuffer(buffer);
}

export async function loadWasmModuleFromRootfs(executable) {
    if (!isAbsoluteExecutablePath(executable)) {
        throw new Error(`Not a rootfs path: ${executable}`);
    }

    if (typeof window === 'undefined') {
        return loadFromNodeFilesystem(executable);
    }

    return loadFromBrowserFetch(executable);
}

export function resolveRootfsBuildPath(executable) {
    if (!isAbsoluteExecutablePath(executable)) {
        return null;
    }
    return rootfsBuildUrlFor(executable);
}
