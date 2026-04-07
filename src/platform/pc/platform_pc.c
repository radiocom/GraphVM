#include "platform/platform.h"

#include <stdio.h>
#include <stdarg.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#include <time.h>
#endif

uint32_t platform_get_time_ms(void) {
#ifdef _WIN32
    return (uint32_t)GetTickCount();
#else
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
#endif
}

void platform_delay_ms(uint32_t ms) {
#ifdef _WIN32
    Sleep(ms);
#else
    usleep(ms * 1000);
#endif
}

void platform_log(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vprintf(fmt, args);
    va_end(args);
}
