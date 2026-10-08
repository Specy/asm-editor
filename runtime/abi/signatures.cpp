#include <assert.h>
#include <ctype.h>
#include <errno.h>
#include <float.h>
#include <inttypes.h>
#include <iso646.h>
#include <limits.h>
#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdnoreturn.h>
#include <string.h>
#include <time.h>
using __aed_type___assert_fail = void (const char *expr, const char *file, int line, const char *func);
template<class T> __attribute__((used,noinline)) void __aed_sig___assert_fail(T *) {}
void __aed_use___assert_fail() { __aed_sig___assert_fail(static_cast<__aed_type___assert_fail *>(&__assert_fail)); }
using __aed_type_isalnum = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isalnum(T *) {}
void __aed_use_isalnum() { __aed_sig_isalnum(static_cast<__aed_type_isalnum *>(&isalnum)); }
using __aed_type_isalpha = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isalpha(T *) {}
void __aed_use_isalpha() { __aed_sig_isalpha(static_cast<__aed_type_isalpha *>(&isalpha)); }
using __aed_type_isblank = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isblank(T *) {}
void __aed_use_isblank() { __aed_sig_isblank(static_cast<__aed_type_isblank *>(&isblank)); }
using __aed_type_iscntrl = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_iscntrl(T *) {}
void __aed_use_iscntrl() { __aed_sig_iscntrl(static_cast<__aed_type_iscntrl *>(&iscntrl)); }
using __aed_type_isdigit = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isdigit(T *) {}
void __aed_use_isdigit() { __aed_sig_isdigit(static_cast<__aed_type_isdigit *>(&isdigit)); }
using __aed_type_isgraph = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isgraph(T *) {}
void __aed_use_isgraph() { __aed_sig_isgraph(static_cast<__aed_type_isgraph *>(&isgraph)); }
using __aed_type_islower = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_islower(T *) {}
void __aed_use_islower() { __aed_sig_islower(static_cast<__aed_type_islower *>(&islower)); }
using __aed_type_isprint = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isprint(T *) {}
void __aed_use_isprint() { __aed_sig_isprint(static_cast<__aed_type_isprint *>(&isprint)); }
using __aed_type_ispunct = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_ispunct(T *) {}
void __aed_use_ispunct() { __aed_sig_ispunct(static_cast<__aed_type_ispunct *>(&ispunct)); }
using __aed_type_isspace = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isspace(T *) {}
void __aed_use_isspace() { __aed_sig_isspace(static_cast<__aed_type_isspace *>(&isspace)); }
using __aed_type_isupper = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isupper(T *) {}
void __aed_use_isupper() { __aed_sig_isupper(static_cast<__aed_type_isupper *>(&isupper)); }
using __aed_type_isxdigit = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_isxdigit(T *) {}
void __aed_use_isxdigit() { __aed_sig_isxdigit(static_cast<__aed_type_isxdigit *>(&isxdigit)); }
using __aed_type_tolower = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_tolower(T *) {}
void __aed_use_tolower() { __aed_sig_tolower(static_cast<__aed_type_tolower *>(&tolower)); }
using __aed_type_toupper = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_toupper(T *) {}
void __aed_use_toupper() { __aed_sig_toupper(static_cast<__aed_type_toupper *>(&toupper)); }
using __aed_type_imaxabs = intmax_t (intmax_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_imaxabs(T *) {}
void __aed_use_imaxabs() { __aed_sig_imaxabs(static_cast<__aed_type_imaxabs *>(&imaxabs)); }
using __aed_type_imaxdiv = imaxdiv_t (intmax_t num, intmax_t den);
template<class T> __attribute__((used,noinline)) void __aed_sig_imaxdiv(T *) {}
void __aed_use_imaxdiv() { __aed_sig_imaxdiv(static_cast<__aed_type_imaxdiv *>(&imaxdiv)); }
using __aed_type_strtoimax = intmax_t (const char *str, char * *end, int base);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtoimax(T *) {}
void __aed_use_strtoimax() { __aed_sig_strtoimax(static_cast<__aed_type_strtoimax *>(&strtoimax)); }
using __aed_type_strtoumax = uintmax_t (const char *str, char * *end, int base);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtoumax(T *) {}
void __aed_use_strtoumax() { __aed_sig_strtoumax(static_cast<__aed_type_strtoumax *>(&strtoumax)); }
using __aed_type_fabs = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_fabs(T *) {}
void __aed_use_fabs() { __aed_sig_fabs(static_cast<__aed_type_fabs *>(&fabs)); }
using __aed_type_floor = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_floor(T *) {}
void __aed_use_floor() { __aed_sig_floor(static_cast<__aed_type_floor *>(&floor)); }
using __aed_type_ceil = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_ceil(T *) {}
void __aed_use_ceil() { __aed_sig_ceil(static_cast<__aed_type_ceil *>(&ceil)); }
using __aed_type_round = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_round(T *) {}
void __aed_use_round() { __aed_sig_round(static_cast<__aed_type_round *>(&round)); }
using __aed_type_trunc = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_trunc(T *) {}
void __aed_use_trunc() { __aed_sig_trunc(static_cast<__aed_type_trunc *>(&trunc)); }
using __aed_type_fmod = double (double x, double y);
template<class T> __attribute__((used,noinline)) void __aed_sig_fmod(T *) {}
void __aed_use_fmod() { __aed_sig_fmod(static_cast<__aed_type_fmod *>(&fmod)); }
using __aed_type_sqrt = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_sqrt(T *) {}
void __aed_use_sqrt() { __aed_sig_sqrt(static_cast<__aed_type_sqrt *>(&sqrt)); }
using __aed_type_cbrt = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_cbrt(T *) {}
void __aed_use_cbrt() { __aed_sig_cbrt(static_cast<__aed_type_cbrt *>(&cbrt)); }
using __aed_type_hypot = double (double x, double y);
template<class T> __attribute__((used,noinline)) void __aed_sig_hypot(T *) {}
void __aed_use_hypot() { __aed_sig_hypot(static_cast<__aed_type_hypot *>(&hypot)); }
using __aed_type_pow = double (double x, double y);
template<class T> __attribute__((used,noinline)) void __aed_sig_pow(T *) {}
void __aed_use_pow() { __aed_sig_pow(static_cast<__aed_type_pow *>(&pow)); }
using __aed_type_exp = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_exp(T *) {}
void __aed_use_exp() { __aed_sig_exp(static_cast<__aed_type_exp *>(&exp)); }
using __aed_type_expm1 = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_expm1(T *) {}
void __aed_use_expm1() { __aed_sig_expm1(static_cast<__aed_type_expm1 *>(&expm1)); }
using __aed_type_log = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_log(T *) {}
void __aed_use_log() { __aed_sig_log(static_cast<__aed_type_log *>(&log)); }
using __aed_type_log10 = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_log10(T *) {}
void __aed_use_log10() { __aed_sig_log10(static_cast<__aed_type_log10 *>(&log10)); }
using __aed_type_log2 = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_log2(T *) {}
void __aed_use_log2() { __aed_sig_log2(static_cast<__aed_type_log2 *>(&log2)); }
using __aed_type_sin = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_sin(T *) {}
void __aed_use_sin() { __aed_sig_sin(static_cast<__aed_type_sin *>(&sin)); }
using __aed_type_cos = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_cos(T *) {}
void __aed_use_cos() { __aed_sig_cos(static_cast<__aed_type_cos *>(&cos)); }
using __aed_type_tan = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_tan(T *) {}
void __aed_use_tan() { __aed_sig_tan(static_cast<__aed_type_tan *>(&tan)); }
using __aed_type_sincos = void (double x, double *s, double *c);
template<class T> __attribute__((used,noinline)) void __aed_sig_sincos(T *) {}
void __aed_use_sincos() { __aed_sig_sincos(static_cast<__aed_type_sincos *>(&sincos)); }
using __aed_type_asin = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_asin(T *) {}
void __aed_use_asin() { __aed_sig_asin(static_cast<__aed_type_asin *>(&asin)); }
using __aed_type_acos = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_acos(T *) {}
void __aed_use_acos() { __aed_sig_acos(static_cast<__aed_type_acos *>(&acos)); }
using __aed_type_atan = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_atan(T *) {}
void __aed_use_atan() { __aed_sig_atan(static_cast<__aed_type_atan *>(&atan)); }
using __aed_type_atan2 = double (double y, double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_atan2(T *) {}
void __aed_use_atan2() { __aed_sig_atan2(static_cast<__aed_type_atan2 *>(&atan2)); }
using __aed_type_sinh = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_sinh(T *) {}
void __aed_use_sinh() { __aed_sig_sinh(static_cast<__aed_type_sinh *>(&sinh)); }
using __aed_type_cosh = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_cosh(T *) {}
void __aed_use_cosh() { __aed_sig_cosh(static_cast<__aed_type_cosh *>(&cosh)); }
using __aed_type_tanh = double (double x);
template<class T> __attribute__((used,noinline)) void __aed_sig_tanh(T *) {}
void __aed_use_tanh() { __aed_sig_tanh(static_cast<__aed_type_tanh *>(&tanh)); }
using __aed_type_frexp = double (double x, int *exp);
template<class T> __attribute__((used,noinline)) void __aed_sig_frexp(T *) {}
void __aed_use_frexp() { __aed_sig_frexp(static_cast<__aed_type_frexp *>(&frexp)); }
using __aed_type_ldexp = double (double x, int exp);
template<class T> __attribute__((used,noinline)) void __aed_sig_ldexp(T *) {}
void __aed_use_ldexp() { __aed_sig_ldexp(static_cast<__aed_type_ldexp *>(&ldexp)); }
using __aed_type_scalbn = double (double x, int n);
template<class T> __attribute__((used,noinline)) void __aed_sig_scalbn(T *) {}
void __aed_use_scalbn() { __aed_sig_scalbn(static_cast<__aed_type_scalbn *>(&scalbn)); }
using __aed_type_modf = double (double x, double *ip);
template<class T> __attribute__((used,noinline)) void __aed_sig_modf(T *) {}
void __aed_use_modf() { __aed_sig_modf(static_cast<__aed_type_modf *>(&modf)); }
using __aed_type_copysign = double (double x, double y);
template<class T> __attribute__((used,noinline)) void __aed_sig_copysign(T *) {}
void __aed_use_copysign() { __aed_sig_copysign(static_cast<__aed_type_copysign *>(&copysign)); }
using __aed_type_fmin = double (double x, double y);
template<class T> __attribute__((used,noinline)) void __aed_sig_fmin(T *) {}
void __aed_use_fmin() { __aed_sig_fmin(static_cast<__aed_type_fmin *>(&fmin)); }
using __aed_type_fmax = double (double x, double y);
template<class T> __attribute__((used,noinline)) void __aed_sig_fmax(T *) {}
void __aed_use_fmax() { __aed_sig_fmax(static_cast<__aed_type_fmax *>(&fmax)); }
using __aed_type_sqrtf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_sqrtf(T *) {}
void __aed_use_sqrtf() { __aed_sig_sqrtf(static_cast<__aed_type_sqrtf *>(&sqrtf)); }
using __aed_type_fabsf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_fabsf(T *) {}
void __aed_use_fabsf() { __aed_sig_fabsf(static_cast<__aed_type_fabsf *>(&fabsf)); }
using __aed_type_floorf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_floorf(T *) {}
void __aed_use_floorf() { __aed_sig_floorf(static_cast<__aed_type_floorf *>(&floorf)); }
using __aed_type_ceilf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_ceilf(T *) {}
void __aed_use_ceilf() { __aed_sig_ceilf(static_cast<__aed_type_ceilf *>(&ceilf)); }
using __aed_type_roundf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_roundf(T *) {}
void __aed_use_roundf() { __aed_sig_roundf(static_cast<__aed_type_roundf *>(&roundf)); }
using __aed_type_truncf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_truncf(T *) {}
void __aed_use_truncf() { __aed_sig_truncf(static_cast<__aed_type_truncf *>(&truncf)); }
using __aed_type_fmodf = float (float x, float y);
template<class T> __attribute__((used,noinline)) void __aed_sig_fmodf(T *) {}
void __aed_use_fmodf() { __aed_sig_fmodf(static_cast<__aed_type_fmodf *>(&fmodf)); }
using __aed_type_sinf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_sinf(T *) {}
void __aed_use_sinf() { __aed_sig_sinf(static_cast<__aed_type_sinf *>(&sinf)); }
using __aed_type_cosf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_cosf(T *) {}
void __aed_use_cosf() { __aed_sig_cosf(static_cast<__aed_type_cosf *>(&cosf)); }
using __aed_type_tanf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_tanf(T *) {}
void __aed_use_tanf() { __aed_sig_tanf(static_cast<__aed_type_tanf *>(&tanf)); }
using __aed_type_sincosf = void (float x, float *s, float *c);
template<class T> __attribute__((used,noinline)) void __aed_sig_sincosf(T *) {}
void __aed_use_sincosf() { __aed_sig_sincosf(static_cast<__aed_type_sincosf *>(&sincosf)); }
using __aed_type_expf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_expf(T *) {}
void __aed_use_expf() { __aed_sig_expf(static_cast<__aed_type_expf *>(&expf)); }
using __aed_type_logf = float (float x);
template<class T> __attribute__((used,noinline)) void __aed_sig_logf(T *) {}
void __aed_use_logf() { __aed_sig_logf(static_cast<__aed_type_logf *>(&logf)); }
using __aed_type_powf = float (float x, float y);
template<class T> __attribute__((used,noinline)) void __aed_sig_powf(T *) {}
void __aed_use_powf() { __aed_sig_powf(static_cast<__aed_type_powf *>(&powf)); }
using __aed_type_fopen = FILE *(const char *path, const char *mode);
template<class T> __attribute__((used,noinline)) void __aed_sig_fopen(T *) {}
void __aed_use_fopen() { __aed_sig_fopen(static_cast<__aed_type_fopen *>(&fopen)); }
using __aed_type_freopen = FILE *(const char *path, const char *mode, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_freopen(T *) {}
void __aed_use_freopen() { __aed_sig_freopen(static_cast<__aed_type_freopen *>(&freopen)); }
using __aed_type_fclose = int (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fclose(T *) {}
void __aed_use_fclose() { __aed_sig_fclose(static_cast<__aed_type_fclose *>(&fclose)); }
using __aed_type_fflush = int (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fflush(T *) {}
void __aed_use_fflush() { __aed_sig_fflush(static_cast<__aed_type_fflush *>(&fflush)); }
using __aed_type_setvbuf = int (FILE *stream, char *buf, int mode, size_t size);
template<class T> __attribute__((used,noinline)) void __aed_sig_setvbuf(T *) {}
void __aed_use_setvbuf() { __aed_sig_setvbuf(static_cast<__aed_type_setvbuf *>(&setvbuf)); }
using __aed_type_setbuf = void (FILE *stream, char *buf);
template<class T> __attribute__((used,noinline)) void __aed_sig_setbuf(T *) {}
void __aed_use_setbuf() { __aed_sig_setbuf(static_cast<__aed_type_setbuf *>(&setbuf)); }
using __aed_type_printf = int (const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_printf(T *) {}
void __aed_use_printf() { __aed_sig_printf(static_cast<__aed_type_printf *>(&printf)); }
using __aed_type_fprintf = int (FILE *stream, const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_fprintf(T *) {}
void __aed_use_fprintf() { __aed_sig_fprintf(static_cast<__aed_type_fprintf *>(&fprintf)); }
using __aed_type_sprintf = int (char *str, const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_sprintf(T *) {}
void __aed_use_sprintf() { __aed_sig_sprintf(static_cast<__aed_type_sprintf *>(&sprintf)); }
using __aed_type_snprintf = int (char *str, size_t n, const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_snprintf(T *) {}
void __aed_use_snprintf() { __aed_sig_snprintf(static_cast<__aed_type_snprintf *>(&snprintf)); }
using __aed_type_vprintf = int (const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vprintf(T *) {}
void __aed_use_vprintf() { __aed_sig_vprintf(static_cast<__aed_type_vprintf *>(&vprintf)); }
using __aed_type_vfprintf = int (FILE *stream, const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vfprintf(T *) {}
void __aed_use_vfprintf() { __aed_sig_vfprintf(static_cast<__aed_type_vfprintf *>(&vfprintf)); }
using __aed_type_vsprintf = int (char *str, const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vsprintf(T *) {}
void __aed_use_vsprintf() { __aed_sig_vsprintf(static_cast<__aed_type_vsprintf *>(&vsprintf)); }
using __aed_type_vsnprintf = int (char *str, size_t n, const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vsnprintf(T *) {}
void __aed_use_vsnprintf() { __aed_sig_vsnprintf(static_cast<__aed_type_vsnprintf *>(&vsnprintf)); }
using __aed_type_scanf = int (const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_scanf(T *) {}
void __aed_use_scanf() { __aed_sig_scanf(static_cast<__aed_type_scanf *>(&scanf)); }
using __aed_type_fscanf = int (FILE *stream, const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_fscanf(T *) {}
void __aed_use_fscanf() { __aed_sig_fscanf(static_cast<__aed_type_fscanf *>(&fscanf)); }
using __aed_type_sscanf = int (const char *str, const char *format, ...);
template<class T> __attribute__((used,noinline)) void __aed_sig_sscanf(T *) {}
void __aed_use_sscanf() { __aed_sig_sscanf(static_cast<__aed_type_sscanf *>(&sscanf)); }
using __aed_type_vscanf = int (const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vscanf(T *) {}
void __aed_use_vscanf() { __aed_sig_vscanf(static_cast<__aed_type_vscanf *>(&vscanf)); }
using __aed_type_vfscanf = int (FILE *stream, const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vfscanf(T *) {}
void __aed_use_vfscanf() { __aed_sig_vfscanf(static_cast<__aed_type_vfscanf *>(&vfscanf)); }
using __aed_type_vsscanf = int (const char *str, const char *format, va_list ap);
template<class T> __attribute__((used,noinline)) void __aed_sig_vsscanf(T *) {}
void __aed_use_vsscanf() { __aed_sig_vsscanf(static_cast<__aed_type_vsscanf *>(&vsscanf)); }
using __aed_type_fgetc = int (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fgetc(T *) {}
void __aed_use_fgetc() { __aed_sig_fgetc(static_cast<__aed_type_fgetc *>(&fgetc)); }
using __aed_type_getc = int (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_getc(T *) {}
void __aed_use_getc() { __aed_sig_getc(static_cast<__aed_type_getc *>(&getc)); }
using __aed_type_getchar = int (void);
template<class T> __attribute__((used,noinline)) void __aed_sig_getchar(T *) {}
void __aed_use_getchar() { __aed_sig_getchar(static_cast<__aed_type_getchar *>(&getchar)); }
using __aed_type_fgets = char *(char *str, int n, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fgets(T *) {}
void __aed_use_fgets() { __aed_sig_fgets(static_cast<__aed_type_fgets *>(&fgets)); }
using __aed_type_ungetc = int (int c, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_ungetc(T *) {}
void __aed_use_ungetc() { __aed_sig_ungetc(static_cast<__aed_type_ungetc *>(&ungetc)); }
using __aed_type_fputc = int (int c, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fputc(T *) {}
void __aed_use_fputc() { __aed_sig_fputc(static_cast<__aed_type_fputc *>(&fputc)); }
using __aed_type_putc = int (int c, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_putc(T *) {}
void __aed_use_putc() { __aed_sig_putc(static_cast<__aed_type_putc *>(&putc)); }
using __aed_type_putchar = int (int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_putchar(T *) {}
void __aed_use_putchar() { __aed_sig_putchar(static_cast<__aed_type_putchar *>(&putchar)); }
using __aed_type_fputs = int (const char *str, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fputs(T *) {}
void __aed_use_fputs() { __aed_sig_fputs(static_cast<__aed_type_fputs *>(&fputs)); }
using __aed_type_puts = int (const char *str);
template<class T> __attribute__((used,noinline)) void __aed_sig_puts(T *) {}
void __aed_use_puts() { __aed_sig_puts(static_cast<__aed_type_puts *>(&puts)); }
using __aed_type_fread = size_t (void *ptr, size_t size, size_t count, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fread(T *) {}
void __aed_use_fread() { __aed_sig_fread(static_cast<__aed_type_fread *>(&fread)); }
using __aed_type_fwrite = size_t (const void *ptr, size_t size, size_t count, FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_fwrite(T *) {}
void __aed_use_fwrite() { __aed_sig_fwrite(static_cast<__aed_type_fwrite *>(&fwrite)); }
using __aed_type_fseek = int (FILE *stream, long offset, int whence);
template<class T> __attribute__((used,noinline)) void __aed_sig_fseek(T *) {}
void __aed_use_fseek() { __aed_sig_fseek(static_cast<__aed_type_fseek *>(&fseek)); }
using __aed_type_ftell = long (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_ftell(T *) {}
void __aed_use_ftell() { __aed_sig_ftell(static_cast<__aed_type_ftell *>(&ftell)); }
using __aed_type_rewind = void (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_rewind(T *) {}
void __aed_use_rewind() { __aed_sig_rewind(static_cast<__aed_type_rewind *>(&rewind)); }
using __aed_type_fgetpos = int (FILE *stream, fpos_t *pos);
template<class T> __attribute__((used,noinline)) void __aed_sig_fgetpos(T *) {}
void __aed_use_fgetpos() { __aed_sig_fgetpos(static_cast<__aed_type_fgetpos *>(&fgetpos)); }
using __aed_type_fsetpos = int (FILE *stream, const fpos_t *pos);
template<class T> __attribute__((used,noinline)) void __aed_sig_fsetpos(T *) {}
void __aed_use_fsetpos() { __aed_sig_fsetpos(static_cast<__aed_type_fsetpos *>(&fsetpos)); }
using __aed_type_feof = int (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_feof(T *) {}
void __aed_use_feof() { __aed_sig_feof(static_cast<__aed_type_feof *>(&feof)); }
using __aed_type_ferror = int (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_ferror(T *) {}
void __aed_use_ferror() { __aed_sig_ferror(static_cast<__aed_type_ferror *>(&ferror)); }
using __aed_type_clearerr = void (FILE *stream);
template<class T> __attribute__((used,noinline)) void __aed_sig_clearerr(T *) {}
void __aed_use_clearerr() { __aed_sig_clearerr(static_cast<__aed_type_clearerr *>(&clearerr)); }
using __aed_type_perror = void (const char *msg);
template<class T> __attribute__((used,noinline)) void __aed_sig_perror(T *) {}
void __aed_use_perror() { __aed_sig_perror(static_cast<__aed_type_perror *>(&perror)); }
using __aed_type_malloc = void *(size_t size);
template<class T> __attribute__((used,noinline)) void __aed_sig_malloc(T *) {}
void __aed_use_malloc() { __aed_sig_malloc(static_cast<__aed_type_malloc *>(&malloc)); }
using __aed_type_calloc = void *(size_t count, size_t size);
template<class T> __attribute__((used,noinline)) void __aed_sig_calloc(T *) {}
void __aed_use_calloc() { __aed_sig_calloc(static_cast<__aed_type_calloc *>(&calloc)); }
using __aed_type_realloc = void *(void *ptr, size_t size);
template<class T> __attribute__((used,noinline)) void __aed_sig_realloc(T *) {}
void __aed_use_realloc() { __aed_sig_realloc(static_cast<__aed_type_realloc *>(&realloc)); }
using __aed_type_aligned_alloc = void *(size_t alignment, size_t size);
template<class T> __attribute__((used,noinline)) void __aed_sig_aligned_alloc(T *) {}
void __aed_use_aligned_alloc() { __aed_sig_aligned_alloc(static_cast<__aed_type_aligned_alloc *>(&aligned_alloc)); }
using __aed_type_free = void (void *ptr);
template<class T> __attribute__((used,noinline)) void __aed_sig_free(T *) {}
void __aed_use_free() { __aed_sig_free(static_cast<__aed_type_free *>(&free)); }
using __aed_type_atoi = int (const char *str);
template<class T> __attribute__((used,noinline)) void __aed_sig_atoi(T *) {}
void __aed_use_atoi() { __aed_sig_atoi(static_cast<__aed_type_atoi *>(&atoi)); }
using __aed_type_atol = long (const char *str);
template<class T> __attribute__((used,noinline)) void __aed_sig_atol(T *) {}
void __aed_use_atol() { __aed_sig_atol(static_cast<__aed_type_atol *>(&atol)); }
using __aed_type_atoll = long long (const char *str);
template<class T> __attribute__((used,noinline)) void __aed_sig_atoll(T *) {}
void __aed_use_atoll() { __aed_sig_atoll(static_cast<__aed_type_atoll *>(&atoll)); }
using __aed_type_atof = double (const char *str);
template<class T> __attribute__((used,noinline)) void __aed_sig_atof(T *) {}
void __aed_use_atof() { __aed_sig_atof(static_cast<__aed_type_atof *>(&atof)); }
using __aed_type_strtol = long (const char *str, char * *end, int base);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtol(T *) {}
void __aed_use_strtol() { __aed_sig_strtol(static_cast<__aed_type_strtol *>(&strtol)); }
using __aed_type_strtoul = unsigned long (const char *str, char * *end, int base);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtoul(T *) {}
void __aed_use_strtoul() { __aed_sig_strtoul(static_cast<__aed_type_strtoul *>(&strtoul)); }
using __aed_type_strtoll = long long (const char *str, char * *end, int base);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtoll(T *) {}
void __aed_use_strtoll() { __aed_sig_strtoll(static_cast<__aed_type_strtoll *>(&strtoll)); }
using __aed_type_strtoull = unsigned long long (const char *str, char * *end, int base);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtoull(T *) {}
void __aed_use_strtoull() { __aed_sig_strtoull(static_cast<__aed_type_strtoull *>(&strtoull)); }
using __aed_type_strtod = double (const char *str, char * *end);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtod(T *) {}
void __aed_use_strtod() { __aed_sig_strtod(static_cast<__aed_type_strtod *>(&strtod)); }
using __aed_type_strtof = float (const char *str, char * *end);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtof(T *) {}
void __aed_use_strtof() { __aed_sig_strtof(static_cast<__aed_type_strtof *>(&strtof)); }
using __aed_type_abs = int (int n);
template<class T> __attribute__((used,noinline)) void __aed_sig_abs(T *) {}
void __aed_use_abs() { __aed_sig_abs(static_cast<__aed_type_abs *>(&abs)); }
using __aed_type_labs = long (long n);
template<class T> __attribute__((used,noinline)) void __aed_sig_labs(T *) {}
void __aed_use_labs() { __aed_sig_labs(static_cast<__aed_type_labs *>(&labs)); }
using __aed_type_llabs = long long (long long n);
template<class T> __attribute__((used,noinline)) void __aed_sig_llabs(T *) {}
void __aed_use_llabs() { __aed_sig_llabs(static_cast<__aed_type_llabs *>(&llabs)); }
using __aed_type_div = div_t (int num, int den);
template<class T> __attribute__((used,noinline)) void __aed_sig_div(T *) {}
void __aed_use_div() { __aed_sig_div(static_cast<__aed_type_div *>(&div)); }
using __aed_type_ldiv = ldiv_t (long num, long den);
template<class T> __attribute__((used,noinline)) void __aed_sig_ldiv(T *) {}
void __aed_use_ldiv() { __aed_sig_ldiv(static_cast<__aed_type_ldiv *>(&ldiv)); }
using __aed_type_lldiv = lldiv_t (long long num, long long den);
template<class T> __attribute__((used,noinline)) void __aed_sig_lldiv(T *) {}
void __aed_use_lldiv() { __aed_sig_lldiv(static_cast<__aed_type_lldiv *>(&lldiv)); }
using __aed_type_qsort = void (void *base, size_t count, size_t size, int(*cmp)(const void *, const void *));
template<class T> __attribute__((used,noinline)) void __aed_sig_qsort(T *) {}
void __aed_use_qsort() { __aed_sig_qsort(static_cast<__aed_type_qsort *>(&qsort)); }
using __aed_type_bsearch = void *(const void *key, const void *base, size_t count, size_t size, int(*cmp)(const void *, const void *));
template<class T> __attribute__((used,noinline)) void __aed_sig_bsearch(T *) {}
void __aed_use_bsearch() { __aed_sig_bsearch(static_cast<__aed_type_bsearch *>(&bsearch)); }
using __aed_type_rand = int (void);
template<class T> __attribute__((used,noinline)) void __aed_sig_rand(T *) {}
void __aed_use_rand() { __aed_sig_rand(static_cast<__aed_type_rand *>(&rand)); }
using __aed_type_srand = void (unsigned int seed);
template<class T> __attribute__((used,noinline)) void __aed_sig_srand(T *) {}
void __aed_use_srand() { __aed_sig_srand(static_cast<__aed_type_srand *>(&srand)); }
using __aed_type_exit = void (int status);
template<class T> __attribute__((used,noinline)) void __aed_sig_exit(T *) {}
void __aed_use_exit() { __aed_sig_exit(static_cast<__aed_type_exit *>(&exit)); }
using __aed_type__Exit = void (int status);
template<class T> __attribute__((used,noinline)) void __aed_sig__Exit(T *) {}
void __aed_use__Exit() { __aed_sig__Exit(static_cast<__aed_type__Exit *>(&_Exit)); }
using __aed_type_abort = void (void);
template<class T> __attribute__((used,noinline)) void __aed_sig_abort(T *) {}
void __aed_use_abort() { __aed_sig_abort(static_cast<__aed_type_abort *>(&abort)); }
using __aed_type_atexit = int (void(*func)(void));
template<class T> __attribute__((used,noinline)) void __aed_sig_atexit(T *) {}
void __aed_use_atexit() { __aed_sig_atexit(static_cast<__aed_type_atexit *>(&atexit)); }
using __aed_type_getenv = char *(const char *name);
template<class T> __attribute__((used,noinline)) void __aed_sig_getenv(T *) {}
void __aed_use_getenv() { __aed_sig_getenv(static_cast<__aed_type_getenv *>(&getenv)); }
using __aed_type_memcpy = void *(void *dest, const void *src, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_memcpy(T *) {}
void __aed_use_memcpy() { __aed_sig_memcpy(static_cast<__aed_type_memcpy *>(&memcpy)); }
using __aed_type_memmove = void *(void *dest, const void *src, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_memmove(T *) {}
void __aed_use_memmove() { __aed_sig_memmove(static_cast<__aed_type_memmove *>(&memmove)); }
using __aed_type_memset = void *(void *dest, int c, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_memset(T *) {}
void __aed_use_memset() { __aed_sig_memset(static_cast<__aed_type_memset *>(&memset)); }
using __aed_type_memcmp = int (const void *a, const void *b, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_memcmp(T *) {}
void __aed_use_memcmp() { __aed_sig_memcmp(static_cast<__aed_type_memcmp *>(&memcmp)); }
using __aed_type_memchr = void *(const void *s, int c, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_memchr(T *) {}
void __aed_use_memchr() { __aed_sig_memchr(static_cast<__aed_type_memchr *>(&memchr)); }
using __aed_type_strlen = size_t (const char *s);
template<class T> __attribute__((used,noinline)) void __aed_sig_strlen(T *) {}
void __aed_use_strlen() { __aed_sig_strlen(static_cast<__aed_type_strlen *>(&strlen)); }
using __aed_type_strnlen = size_t (const char *s, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_strnlen(T *) {}
void __aed_use_strnlen() { __aed_sig_strnlen(static_cast<__aed_type_strnlen *>(&strnlen)); }
using __aed_type_strcpy = char *(char *dest, const char *src);
template<class T> __attribute__((used,noinline)) void __aed_sig_strcpy(T *) {}
void __aed_use_strcpy() { __aed_sig_strcpy(static_cast<__aed_type_strcpy *>(&strcpy)); }
using __aed_type_strncpy = char *(char *dest, const char *src, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_strncpy(T *) {}
void __aed_use_strncpy() { __aed_sig_strncpy(static_cast<__aed_type_strncpy *>(&strncpy)); }
using __aed_type_strcat = char *(char *dest, const char *src);
template<class T> __attribute__((used,noinline)) void __aed_sig_strcat(T *) {}
void __aed_use_strcat() { __aed_sig_strcat(static_cast<__aed_type_strcat *>(&strcat)); }
using __aed_type_strncat = char *(char *dest, const char *src, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_strncat(T *) {}
void __aed_use_strncat() { __aed_sig_strncat(static_cast<__aed_type_strncat *>(&strncat)); }
using __aed_type_strcmp = int (const char *a, const char *b);
template<class T> __attribute__((used,noinline)) void __aed_sig_strcmp(T *) {}
void __aed_use_strcmp() { __aed_sig_strcmp(static_cast<__aed_type_strcmp *>(&strcmp)); }
using __aed_type_strncmp = int (const char *a, const char *b, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_strncmp(T *) {}
void __aed_use_strncmp() { __aed_sig_strncmp(static_cast<__aed_type_strncmp *>(&strncmp)); }
using __aed_type_strcoll = int (const char *a, const char *b);
template<class T> __attribute__((used,noinline)) void __aed_sig_strcoll(T *) {}
void __aed_use_strcoll() { __aed_sig_strcoll(static_cast<__aed_type_strcoll *>(&strcoll)); }
using __aed_type_strxfrm = size_t (char *dest, const char *src, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_strxfrm(T *) {}
void __aed_use_strxfrm() { __aed_sig_strxfrm(static_cast<__aed_type_strxfrm *>(&strxfrm)); }
using __aed_type_strchr = char *(const char *s, int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_strchr(T *) {}
void __aed_use_strchr() { __aed_sig_strchr(static_cast<__aed_type_strchr *>(&strchr)); }
using __aed_type_strrchr = char *(const char *s, int c);
template<class T> __attribute__((used,noinline)) void __aed_sig_strrchr(T *) {}
void __aed_use_strrchr() { __aed_sig_strrchr(static_cast<__aed_type_strrchr *>(&strrchr)); }
using __aed_type_strstr = char *(const char *haystack, const char *needle);
template<class T> __attribute__((used,noinline)) void __aed_sig_strstr(T *) {}
void __aed_use_strstr() { __aed_sig_strstr(static_cast<__aed_type_strstr *>(&strstr)); }
using __aed_type_strspn = size_t (const char *s, const char *accept);
template<class T> __attribute__((used,noinline)) void __aed_sig_strspn(T *) {}
void __aed_use_strspn() { __aed_sig_strspn(static_cast<__aed_type_strspn *>(&strspn)); }
using __aed_type_strcspn = size_t (const char *s, const char *reject);
template<class T> __attribute__((used,noinline)) void __aed_sig_strcspn(T *) {}
void __aed_use_strcspn() { __aed_sig_strcspn(static_cast<__aed_type_strcspn *>(&strcspn)); }
using __aed_type_strpbrk = char *(const char *s, const char *accept);
template<class T> __attribute__((used,noinline)) void __aed_sig_strpbrk(T *) {}
void __aed_use_strpbrk() { __aed_sig_strpbrk(static_cast<__aed_type_strpbrk *>(&strpbrk)); }
using __aed_type_strtok = char *(char *str, const char *delim);
template<class T> __attribute__((used,noinline)) void __aed_sig_strtok(T *) {}
void __aed_use_strtok() { __aed_sig_strtok(static_cast<__aed_type_strtok *>(&strtok)); }
using __aed_type_strdup = char *(const char *s);
template<class T> __attribute__((used,noinline)) void __aed_sig_strdup(T *) {}
void __aed_use_strdup() { __aed_sig_strdup(static_cast<__aed_type_strdup *>(&strdup)); }
using __aed_type_strndup = char *(const char *s, size_t n);
template<class T> __attribute__((used,noinline)) void __aed_sig_strndup(T *) {}
void __aed_use_strndup() { __aed_sig_strndup(static_cast<__aed_type_strndup *>(&strndup)); }
using __aed_type_strerror = char *(int errnum);
template<class T> __attribute__((used,noinline)) void __aed_sig_strerror(T *) {}
void __aed_use_strerror() { __aed_sig_strerror(static_cast<__aed_type_strerror *>(&strerror)); }
using __aed_type_time = time_t (time_t *t);
template<class T> __attribute__((used,noinline)) void __aed_sig_time(T *) {}
void __aed_use_time() { __aed_sig_time(static_cast<__aed_type_time *>(&time)); }
using __aed_type_clock = clock_t (void);
template<class T> __attribute__((used,noinline)) void __aed_sig_clock(T *) {}
void __aed_use_clock() { __aed_sig_clock(static_cast<__aed_type_clock *>(&clock)); }
using __aed_type_difftime = double (time_t end, time_t start);
template<class T> __attribute__((used,noinline)) void __aed_sig_difftime(T *) {}
void __aed_use_difftime() { __aed_sig_difftime(static_cast<__aed_type_difftime *>(&difftime)); }
using __aed_type_mktime = time_t (struct tm *tm);
template<class T> __attribute__((used,noinline)) void __aed_sig_mktime(T *) {}
void __aed_use_mktime() { __aed_sig_mktime(static_cast<__aed_type_mktime *>(&mktime)); }
using __aed_type_gmtime = struct tm *(const time_t *t);
template<class T> __attribute__((used,noinline)) void __aed_sig_gmtime(T *) {}
void __aed_use_gmtime() { __aed_sig_gmtime(static_cast<__aed_type_gmtime *>(&gmtime)); }
using __aed_type_localtime = struct tm *(const time_t *t);
template<class T> __attribute__((used,noinline)) void __aed_sig_localtime(T *) {}
void __aed_use_localtime() { __aed_sig_localtime(static_cast<__aed_type_localtime *>(&localtime)); }
using __aed_type_asctime = char *(const struct tm *tm);
template<class T> __attribute__((used,noinline)) void __aed_sig_asctime(T *) {}
void __aed_use_asctime() { __aed_sig_asctime(static_cast<__aed_type_asctime *>(&asctime)); }
using __aed_type_ctime = char *(const time_t *t);
template<class T> __attribute__((used,noinline)) void __aed_sig_ctime(T *) {}
void __aed_use_ctime() { __aed_sig_ctime(static_cast<__aed_type_ctime *>(&ctime)); }
