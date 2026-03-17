// Minimal d8 main for Wasm target
// This initializes V8 in jitless/no-snapshot mode and evaluates JS from argv.
//
// Usage: node d8.js --jitless --no-snapshot -e "console.log(1+1)"
//
// This replaces the full d8.cc which has too many dependencies for the first build.
// Once V8 initializes successfully, we can switch to the real d8.cc.

#include "v8.h"
#include "libplatform/libplatform.h"
#include <stdio.h>
#include <string.h>
#include <memory>

int main(int argc, char* argv[]) {
    // Set flags FIRST (before platform creation, so single-threaded is in effect)
    // Note: --jitless implies --no-interpreted-frames-native-stack (they're incompatible)
    const char* v8_flags = "--jitless --single-threaded --no-interpreted-frames-native-stack";
    v8::V8::SetFlagsFromString(v8_flags, strlen(v8_flags));
    v8::V8::SetFlagsFromCommandLine(&argc, argv, true);

    // Initialize V8 with single-threaded platform (no worker threads)
    std::unique_ptr<v8::Platform> platform = v8::platform::NewSingleThreadedDefaultPlatform();
    v8::V8::InitializePlatform(platform.get());

    v8::V8::Initialize();

    // Create isolate
    v8::Isolate::CreateParams create_params;
    create_params.array_buffer_allocator =
        v8::ArrayBuffer::Allocator::NewDefaultAllocator();

    v8::Isolate* isolate = v8::Isolate::New(create_params);

    {
        v8::Isolate::Scope isolate_scope(isolate);
        v8::HandleScope handle_scope(isolate);

        // Create context
        v8::Local<v8::Context> context = v8::Context::New(isolate);
        v8::Context::Scope context_scope(context);

        // Find -e flag and evaluate the expression
        const char* expression = nullptr;
        for (int i = 1; i < argc; i++) {
            if (strcmp(argv[i], "-e") == 0 && i + 1 < argc) {
                expression = argv[i + 1];
                break;
            }
        }

        if (!expression) {
            expression = "1+1";  // Default test expression
        }

        // Compile and run
        v8::Local<v8::String> source =
            v8::String::NewFromUtf8(isolate, expression).ToLocalChecked();

        v8::Local<v8::Script> script;
        if (!v8::Script::Compile(context, source).ToLocal(&script)) {
            fprintf(stderr, "Failed to compile: %s\n", expression);
            return 1;
        }

        v8::Local<v8::Value> result;
        if (!script->Run(context).ToLocal(&result)) {
            fprintf(stderr, "Failed to run: %s\n", expression);
            return 1;
        }

        // Print result
        v8::String::Utf8Value utf8(isolate, result);
        printf("%s\n", *utf8);
    }

    // Cleanup
    isolate->Dispose();
    v8::V8::Dispose();
    v8::V8::DisposePlatform();
    delete create_params.array_buffer_allocator;

    return 0;
}
