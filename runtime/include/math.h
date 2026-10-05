/* Runtime library, ABI v1: <math.h>. double and float functions; long double is not supported.
   The functions do not set errno (math_errhandling is MATH_ERREXCEPT). */
#ifndef _MATH_H
#define _MATH_H

#ifdef __cplusplus
extern "C" {
#endif

#if __FLT_EVAL_METHOD__ == 1
typedef double float_t;
typedef double double_t;
#elif __FLT_EVAL_METHOD__ == 2
typedef long double float_t;
typedef long double double_t;
#else
typedef float float_t;
typedef double double_t;
#endif

#define HUGE_VAL (__builtin_huge_val())
#define HUGE_VALF (__builtin_huge_valf())
#define INFINITY (__builtin_inff())
#define NAN (__builtin_nanf(""))

#define FP_NAN 0
#define FP_INFINITE 1
#define FP_ZERO 2
#define FP_SUBNORMAL 3
#define FP_NORMAL 4

#define MATH_ERRNO 1
#define MATH_ERREXCEPT 2
#define math_errhandling 2

#define M_E 2.7182818284590452354
#define M_LOG2E 1.4426950408889634074
#define M_LOG10E 0.43429448190325182765
#define M_LN2 0.69314718055994530942
#define M_LN10 2.30258509299404568402
#define M_PI 3.14159265358979323846
#define M_PI_2 1.57079632679489661923
#define M_PI_4 0.78539816339744830962
#define M_1_PI 0.31830988618379067154
#define M_2_PI 0.63661977236758134308
#define M_2_SQRTPI 1.12837916709551257390
#define M_SQRT2 1.41421356237309504880
#define M_SQRT1_2 0.70710678118654752440

#ifndef __cplusplus
#define fpclassify(x) __builtin_fpclassify(FP_NAN, FP_INFINITE, FP_NORMAL, FP_SUBNORMAL, FP_ZERO, x)
#define isfinite(x) __builtin_isfinite(x)
#define isinf(x) __builtin_isinf_sign(x)
#define isnan(x) __builtin_isnan(x)
#define isnormal(x) __builtin_isnormal(x)
#define signbit(x) __builtin_signbit(x)
#define isgreater(x, y) __builtin_isgreater(x, y)
#define isgreaterequal(x, y) __builtin_isgreaterequal(x, y)
#define isless(x, y) __builtin_isless(x, y)
#define islessequal(x, y) __builtin_islessequal(x, y)
#define islessgreater(x, y) __builtin_islessgreater(x, y)
#define isunordered(x, y) __builtin_isunordered(x, y)
#endif

/** Returns the absolute value of x. */
double fabs(double x);
/** Returns the largest integer value not greater than x. */
double floor(double x);
/** Returns the smallest integer value not less than x. */
double ceil(double x);
/** Returns x rounded to the nearest integer value, halfway cases away from zero. */
double round(double x);
/** Returns x rounded toward zero to an integer value. */
double trunc(double x);
/** Returns the remainder of x / y with the sign of x. */
double fmod(double x, double y);
/** Returns the square root of x, correctly rounded. */
double sqrt(double x);
/** Returns the cube root of x. */
double cbrt(double x);
/** Returns sqrt(x*x + y*y) without undue overflow or underflow. */
double hypot(double x, double y);
/** Returns x raised to the power y. */
double pow(double x, double y);
/** Returns e raised to the power x. */
double exp(double x);
/** Returns e raised to the power x, minus 1, accurately even for x near 0. */
double expm1(double x);
/** Returns the natural logarithm of x. */
double log(double x);
/** Returns the base-10 logarithm of x. */
double log10(double x);
/** Returns the base-2 logarithm of x. */
double log2(double x);
/** Returns the sine of x (radians). */
double sin(double x);
/** Returns the cosine of x (radians). */
double cos(double x);
/** Returns the tangent of x (radians). */
double tan(double x);
/** Stores the sine and cosine of x (radians) in *s and *c (GNU extension; GCC may combine sin and cos calls into it). */
void sincos(double x, double *s, double *c);
/** Returns the arc sine of x, in radians between -pi/2 and pi/2. */
double asin(double x);
/** Returns the arc cosine of x, in radians between 0 and pi. */
double acos(double x);
/** Returns the arc tangent of x, in radians between -pi/2 and pi/2. */
double atan(double x);
/** Returns the arc tangent of y/x using the signs of both to pick the quadrant, in radians between -pi and pi. */
double atan2(double y, double x);
/** Returns the hyperbolic sine of x. */
double sinh(double x);
/** Returns the hyperbolic cosine of x. */
double cosh(double x);
/** Returns the hyperbolic tangent of x. */
double tanh(double x);
/** Splits x into a fraction in [0.5, 1) returned and a power of two stored in *exp. */
double frexp(double x, int *exp);
/** Returns x multiplied by 2 raised to exp. */
double ldexp(double x, int exp);
/** Returns x multiplied by 2 raised to n. */
double scalbn(double x, int n);
/** Splits x into an integral part stored in *ip and a fractional part returned, both with the sign of x. */
double modf(double x, double *ip);
/** Returns the magnitude of x with the sign of y. */
double copysign(double x, double y);
/** Returns the smaller of x and y, ignoring a NaN argument. */
double fmin(double x, double y);
/** Returns the larger of x and y, ignoring a NaN argument. */
double fmax(double x, double y);

/** Returns the square root of x, correctly rounded (float). */
float sqrtf(float x);
/** Returns the absolute value of x (float). */
float fabsf(float x);
/** Returns the largest integer value not greater than x (float). */
float floorf(float x);
/** Returns the smallest integer value not less than x (float). */
float ceilf(float x);
/** Returns x rounded to the nearest integer value, halfway cases away from zero (float). */
float roundf(float x);
/** Returns x rounded toward zero to an integer value (float). */
float truncf(float x);
/** Returns the remainder of x / y with the sign of x (float). */
float fmodf(float x, float y);
/** Returns the sine of x in radians (float). */
float sinf(float x);
/** Returns the cosine of x in radians (float). */
float cosf(float x);
/** Returns the tangent of x in radians (float). */
float tanf(float x);
/** Stores the sine and cosine of x in radians in *s and *c (float, GNU extension). */
void sincosf(float x, float *s, float *c);
/** Returns e raised to the power x (float). */
float expf(float x);
/** Returns the natural logarithm of x (float). */
float logf(float x);
/** Returns x raised to the power y (float). */
float powf(float x, float y);

#ifdef __cplusplus
}

/* C++: the classification macros become overloaded functions, and float and integer overloads are added, as <cmath> requires.
   Integer arguments are converted to double; long double arguments are not supported. */
extern "C++" {
template <class _T> struct __aed_int {};
template <class _T> struct __aed_arith {};
#define __AED_INT(_T) template <> struct __aed_int<_T> { typedef double type; }; template <> struct __aed_arith<_T> { typedef double type; };
__AED_INT(bool) __AED_INT(char) __AED_INT(signed char) __AED_INT(unsigned char) __AED_INT(wchar_t) __AED_INT(char16_t) __AED_INT(char32_t)
__AED_INT(short) __AED_INT(unsigned short) __AED_INT(int) __AED_INT(unsigned int) __AED_INT(long) __AED_INT(unsigned long)
__AED_INT(long long) __AED_INT(unsigned long long)
#undef __AED_INT
template <> struct __aed_arith<float> { typedef double type; };
template <> struct __aed_arith<double> { typedef double type; };

#define __AED_INTOVL(_F) \
	template <class _T, class = typename __aed_int<_T>::type> inline double _F(_T __x) { return ::_F((double)__x); }
#define __AED_F1(_F) \
	inline float _F(float __x) { return _F##f(__x); } \
	__AED_INTOVL(_F)
#define __AED_D1(_F) \
	inline float _F(float __x) { return (float)::_F((double)__x); } \
	__AED_INTOVL(_F)
#define __AED_MIXED(_F) \
	template <class _A, class _B, class = typename __aed_arith<_A>::type, class = typename __aed_arith<_B>::type> \
	inline double _F(_A __x, _B __y) { return ::_F((double)__x, (double)__y); }

__AED_F1(fabs) __AED_F1(floor) __AED_F1(ceil) __AED_F1(round) __AED_F1(trunc) __AED_F1(sqrt)
__AED_F1(sin) __AED_F1(cos) __AED_F1(tan) __AED_F1(exp) __AED_F1(log)
__AED_D1(cbrt) __AED_D1(log10) __AED_D1(log2) __AED_D1(asin) __AED_D1(acos) __AED_D1(atan)
__AED_D1(sinh) __AED_D1(cosh) __AED_D1(tanh) __AED_D1(expm1)

/** Returns the remainder of x / y with the sign of x (C++ float overload). */
inline float fmod(float __x, float __y) { return fmodf(__x, __y); }
/** Returns x raised to the power y (C++ float overload). */
inline float pow(float __x, float __y) { return powf(__x, __y); }
/** Returns the arc tangent of y/x in the right quadrant (C++ float overload). */
inline float atan2(float __y, float __x) { return (float)::atan2((double)__y, (double)__x); }
/** Returns sqrt(x*x + y*y) without undue overflow (C++ float overload). */
inline float hypot(float __x, float __y) { return (float)::hypot((double)__x, (double)__y); }
/** Returns the magnitude of x with the sign of y (C++ float overload). */
inline float copysign(float __x, float __y) { return __builtin_copysignf(__x, __y); }
/** Returns the smaller of x and y, ignoring a NaN argument (C++ float overload). */
inline float fmin(float __x, float __y) { return (float)::fmin((double)__x, (double)__y); }
/** Returns the larger of x and y, ignoring a NaN argument (C++ float overload). */
inline float fmax(float __x, float __y) { return (float)::fmax((double)__x, (double)__y); }
__AED_MIXED(fmod) __AED_MIXED(pow) __AED_MIXED(atan2) __AED_MIXED(hypot) __AED_MIXED(copysign) __AED_MIXED(fmin) __AED_MIXED(fmax)

/** Splits x into a fraction in [0.5, 1) and a power of two stored in *exp (C++ float overload). */
inline float frexp(float __x, int *__e) { return (float)::frexp((double)__x, __e); }
/** Returns x multiplied by 2 raised to exp (C++ float overload). */
inline float ldexp(float __x, int __e) { return (float)::ldexp((double)__x, __e); }
/** Returns x multiplied by 2 raised to n (C++ float overload). */
inline float scalbn(float __x, int __e) { return (float)::scalbn((double)__x, __e); }
/** Splits x into an integral part stored in *ip and a fractional part returned (C++ float overload). */
inline float modf(float __x, float *__ip) { double __i; float __r = (float)::modf((double)__x, &__i); *__ip = (float)__i; return __r; }
template <class _T, class = typename __aed_int<_T>::type> inline double frexp(_T __x, int *__e) { return ::frexp((double)__x, __e); }
template <class _T, class = typename __aed_int<_T>::type> inline double ldexp(_T __x, int __e) { return ::ldexp((double)__x, __e); }
template <class _T, class = typename __aed_int<_T>::type> inline double scalbn(_T __x, int __e) { return ::scalbn((double)__x, __e); }

#define __AED_CLASS(_R, _F, _B, _I) \
	inline _R _F(float __x) { return _B; } \
	inline _R _F(double __x) { return _B; } \
	template <class _T, class = typename __aed_int<_T>::type> inline _R _F(_T __x) { return _I; }
__AED_CLASS(int, fpclassify, __builtin_fpclassify(FP_NAN, FP_INFINITE, FP_NORMAL, FP_SUBNORMAL, FP_ZERO, __x), __x ? FP_NORMAL : FP_ZERO)
__AED_CLASS(bool, isfinite, __builtin_isfinite(__x), ((void)__x, true))
__AED_CLASS(bool, isinf, __builtin_isinf(__x), ((void)__x, false))
__AED_CLASS(bool, isnan, __builtin_isnan(__x), ((void)__x, false))
__AED_CLASS(bool, isnormal, __builtin_isnormal(__x), __x != 0)
__AED_CLASS(bool, signbit, __builtin_signbit(__x), __x < 0)

#define __AED_CMP(_F) \
	inline bool _F(float __x, float __y) { return __builtin_##_F(__x, __y); } \
	template <class _A, class _B, class = typename __aed_arith<_A>::type, class = typename __aed_arith<_B>::type> \
	inline bool _F(_A __x, _B __y) { return __builtin_##_F((double)__x, (double)__y); }
__AED_CMP(isgreater) __AED_CMP(isgreaterequal) __AED_CMP(isless) __AED_CMP(islessequal) __AED_CMP(islessgreater) __AED_CMP(isunordered)

#undef __AED_INTOVL
#undef __AED_F1
#undef __AED_D1
#undef __AED_MIXED
#undef __AED_CLASS
#undef __AED_CMP
}
#endif

#endif
