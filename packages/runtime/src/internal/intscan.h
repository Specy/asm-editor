/* Derived from musl 1.2.6 src/internal/intscan.h (MIT, see runtime/third_party/musl/COPYRIGHT). Changes: includes features.h. */
#ifndef INTSCAN_H
#define INTSCAN_H

#include <stdio.h>
#include "features.h"

hidden unsigned long long __intscan(FILE *, unsigned, int, unsigned long long);

#endif
