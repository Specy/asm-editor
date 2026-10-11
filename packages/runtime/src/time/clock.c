/* Processor time at CLOCKS_PER_SEC: simulator instructions at nominal 100 MHz. */
#include <time.h>
#include <limits.h>
#include "aed_sys.h"
clock_t clock(void)
{
    unsigned long long ticks = __aed_cpu_ticks();
    return ticks > LONG_MAX ? (clock_t)-1 : (clock_t)ticks;
}
