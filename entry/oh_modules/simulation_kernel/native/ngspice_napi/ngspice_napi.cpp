/**
 * Ngspice NAPI 绑定桩 — 链接真实 libngspice 后替换内部实现
 */
#include "ngspice_napi.h"
#include <cstring>
#include <cmath>

static bool g_initialized = false;

int ngspice_napi_init(void) {
    g_initialized = true;
    return 0;
}

int ngspice_napi_command(const char *cmd) {
    if (!g_initialized || cmd == nullptr) return -1;
    (void)cmd;
    return 0;
}

int ngspice_napi_circ(char **lines) {
    if (!g_initialized || lines == nullptr) return -1;
    (void)lines;
    return 0;
}

static bool g_rcMode = false;
static double g_rcTau = 0.0001;
static int g_rcSample = 0;

int ngspice_napi_get_vector(const char *name, double *outValues, int maxLen) {
    if (!g_initialized || name == nullptr || outValues == nullptr || maxLen <= 0) return -1;
    if (g_rcMode && strcmp(name, "v(out)") == 0) {
        int n = maxLen < 1000 ? maxLen : 1000;
        for (int i = 0; i < n; i++) {
            double t = (5.0 * g_rcTau * i) / n;
            outValues[i] = 5.0 * (1.0 - exp(-t / g_rcTau));
        }
        return n;
    }
    outValues[0] = 0.0;
    return 1;
}

int ngspice_napi_enable_rc_test(double r, double c) {
    g_rcMode = true;
    g_rcTau = r * c;
    g_rcSample = 0;
    return 0;
}

void ngspice_napi_destroy(void) {
    g_initialized = false;
}
