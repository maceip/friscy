#include <node_api.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef SYS_host_fetch
#define SYS_host_fetch 500
#endif

static napi_value make_error(napi_env env, const char* code, const char* msg) {
    napi_value c;
    napi_value m;
    napi_value e;
    napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &c);
    napi_create_string_utf8(env, msg, NAPI_AUTO_LENGTH, &m);
    napi_create_error(env, c, m, &e);
    return e;
}

static napi_value host_fetch(napi_env env, napi_callback_info info) {
    napi_status st;
    size_t argc = 1;
    napi_value argv[1];
    st = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (st != napi_ok || argc < 1) {
        napi_throw(env, make_error(env, "EINVAL", "hostFetch(reqJson) requires 1 argument"));
        return NULL;
    }

    napi_valuetype type;
    st = napi_typeof(env, argv[0], &type);
    if (st != napi_ok || type != napi_string) {
        napi_throw(env, make_error(env, "EINVAL", "hostFetch(reqJson) expects a string"));
        return NULL;
    }

    size_t req_len = 0;
    st = napi_get_value_string_utf8(env, argv[0], NULL, 0, &req_len);
    if (st != napi_ok) {
        napi_throw(env, make_error(env, "EFAIL", "failed to read input length"));
        return NULL;
    }

    char* req = (char*)malloc(req_len + 1);
    if (!req) {
        napi_throw(env, make_error(env, "ENOMEM", "malloc failed for request"));
        return NULL;
    }
    size_t written = 0;
    st = napi_get_value_string_utf8(env, argv[0], req, req_len + 1, &written);
    if (st != napi_ok) {
        free(req);
        napi_throw(env, make_error(env, "EFAIL", "failed to read request"));
        return NULL;
    }

    const size_t resp_cap = 16 * 1024 * 1024;
    char* resp = (char*)malloc(resp_cap);
    if (!resp) {
        free(req);
        napi_throw(env, make_error(env, "ENOMEM", "malloc failed for response"));
        return NULL;
    }

    long n = syscall(SYS_host_fetch, req, written, resp, resp_cap);
    free(req);
    if (n < 0) {
        free(resp);
        char buf[128];
        snprintf(buf, sizeof(buf), "syscall(500) failed: %ld (errno=%d)", n, errno);
        napi_throw(env, make_error(env, "EHOSTFETCH", buf));
        return NULL;
    }

    napi_value out;
    st = napi_create_string_utf8(env, resp, (size_t)n, &out);
    free(resp);
    if (st != napi_ok) {
        napi_throw(env, make_error(env, "EFAIL", "failed to create response string"));
        return NULL;
    }
    return out;
}

static napi_value init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, "hostFetch", NAPI_AUTO_LENGTH, host_fetch, NULL, &fn);
    napi_set_named_property(env, exports, "hostFetch", fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
