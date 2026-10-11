/* Derived from musl 1.2.6 src/internal/floatscan.h (MIT, see runtime/third_party/musl/COPYRIGHT).
 * Changes: returns double instead of long double; includes features.h. */
#ifndef FLOATSCAN_H
#define FLOATSCAN_H

#include <stdio.h>
#include "features.h"

hidden double __floatscan(FILE *, int, int);

#endif
