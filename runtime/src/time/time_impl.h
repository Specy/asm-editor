/* Derived from musl 1.2.6 src/time/time_impl.h (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: only the declarations this library uses (no time zones, strftime or locales). */
#include <time.h>
#include "features.h"

hidden int __month_to_secs(int, int);
hidden long long __year_to_secs(long long, int *);
hidden long long __tm_to_secs(const struct tm *);
hidden int __secs_to_tm(long long, struct tm *);
