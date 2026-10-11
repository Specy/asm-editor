/* Internal: the attribute macros musl sources expect from musl's src/include/features.h.
   hidden is empty: the library is linked statically and the Cores' assemblers need no visibility directives. */
#ifndef AED_FEATURES_H
#define AED_FEATURES_H

#define weak __attribute__((__weak__))
#define hidden
#define weak_alias(old, new) \
	extern __typeof(old) new __attribute__((__weak__, __alias__(#old)))

#endif
