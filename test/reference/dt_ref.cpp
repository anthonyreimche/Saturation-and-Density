// darktable's color balance rgb, the module the extension ports, run over
// fixed params (darktable's own presets among them) and working-space pixels
// and printed as JSON, with both gamut LUTs. darktable 5.6.1
// (release-5.6.1), © darktable developers, GPL-3.0-or-later. Single
// precision throughout, as darktable runs it; the SSE paths of math.h are the
// ones an x86-64 build takes. The working profile is darktable's linear
// Rec.2020, its matrices built the way lcms builds them (as Channel Mixer's
// model.ts does). The mask display (checkerboard) and the OpenMP pragmas are
// left out; the UCS LUT's reduction runs in loop order.
//
// One addition, marked where it is: each JzAzBz case also runs with the PQ
// curve's powers taken in double (`pq_in_double`), the LUT left as darktable
// builds it. Raising to the 134th power in float is the reference's own
// noise, up to 4e-4 of the pixel; without it the rest of darktable's float
// code is what the model is held to.

#include <cfloat>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <xmmintrin.h>
#include <emmintrin.h>

// ── shims for the darktable vocabulary ──────────────────────────────────────

typedef float dt_aligned_pixel_t[4];

// Not darktable's: see the header.
static int pq_in_double = 0;
typedef float dt_colormatrix_t[4][4];
#define DT_PIXEL_SIMD_CHANNELS 4
#define for_each_channel(_var, ...) for(size_t _var = 0; _var < DT_PIXEL_SIMD_CHANNELS; _var++)
#define for_four_channels(_var, ...) for(size_t _var = 0; _var < 4; _var++)
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define CLAMP(x, low, high) (((x) > (high)) ? (high) : (((x) < (low)) ? (low) : (x)))
#define CLAMPF(a, mn, mx) fminf(fmaxf(a, mn), mx)
#define M_PI_F 3.14159265358979323846f
#define DT_2PI_F 6.28318530717958647693f
#define M_PI_2f 1.57079632679489661923f
#define LUT_ELEM 512
typedef int gboolean;
#define TRUE 1
#define FALSE 0
struct cmsCIExyY { double x, y, Y; };
static const cmsCIExyY D65xyY = { 0.31271, 0.32902, 1.0 };

// ── common/dttypes.h (verbatim) ─────────────────────────────────────────────

static inline void dt_colormatrix_mul(dt_colormatrix_t dst, const dt_colormatrix_t m1, const dt_colormatrix_t m2)
{
  for(int k = 0; k < 3; ++k)
  {
    dt_aligned_pixel_t sum = { 0.0f };
    for_each_channel(i)
    {
      for(int j = 0; j < 3; j++)
        sum[i] += m1[k][j] * m2[j][i];
      dst[k][i] = sum[i];
    }
  }
}

static inline void dt_colormatrix_transpose(dt_colormatrix_t dst,
                                            const dt_colormatrix_t src)
{
  for_four_channels(c)
  {
    dst[0][c] = src[c][0];
    dst[1][c] = src[c][1];
    dst[2][c] = src[c][2];
    dst[3][c] = src[c][3];
  }
}

// ── common/math.h (verbatim, the SSE branches) ──────────────────────────────

static inline float scalar_product(const dt_aligned_pixel_t v_1,
                                   const dt_aligned_pixel_t v_2)
{
  float acc = 0.f;
  for(size_t c = 0; c < 3; c++)
    acc += v_1[c] * v_2[c];
  return acc;
}

static inline void dot_product(const dt_aligned_pixel_t v_in,
                               const dt_colormatrix_t M,
                               dt_aligned_pixel_t v_out)
{
  for(size_t i = 0; i < 3; ++i)
    v_out[i] = scalar_product(v_in, M[i]);
}

static inline float sqf(const float x)
{
  return x * x;
}

static inline void dt_vector_min(dt_aligned_pixel_t min,
                                 const dt_aligned_pixel_t v1,
                                 const dt_aligned_pixel_t v2)
{
  *((__m128*)min) = _mm_min_ps(*((__m128*)v1), *((__m128*)v2));
}

static inline void dt_vector_max(dt_aligned_pixel_t max,
                                 const dt_aligned_pixel_t v1,
                                 const dt_aligned_pixel_t v2)
{
  *((__m128*)max) = _mm_max_ps(*((__m128*)v1), *((__m128*)v2));
}

static inline void dt_vector_round(const dt_aligned_pixel_t input,
                                   dt_aligned_pixel_t rounded)
{
  *((__m128*)rounded) = _mm_cvtepi32_ps(_mm_cvtps_epi32(*((__m128*)input)));
}

static inline void dt_vector_log2(const dt_aligned_pixel_t x,
                                  dt_aligned_pixel_t res)
{
  union { float f[4]; uint32_t i[4]; } mant, vx = { .f = { x[0], x[1], x[2], x[3] } };
  dt_aligned_pixel_t exp;
  for_four_channels(c)
  {
    mant.i[c] = (vx.i[c] & 0x007FFFFF) | 0x3F800000;
    exp[c] = (float)((vx.i[c] & 0x7F800000) >> 23) - 127;
  }
  dt_aligned_pixel_t logmant;
  for_four_channels(c)
  {
    logmant[c] = (((((0.0596515482674574969533f)
                     * mant.f[c] - 0.465725644288844778798f)
                    * mant.f[c] + 1.48116647521213171641f)
                   * mant.f[c] - 2.52074962577807006663f)
                  * mant.f[c] + 2.8882704548164776201f);
  }
  for_four_channels(c)
    res[c] = (logmant[c] * (mant.f[c] - 1.0f)) + exp[c];
}

static inline void dt_vector_exp2(const dt_aligned_pixel_t input,
                                  dt_aligned_pixel_t res)
{
  static const dt_aligned_pixel_t lower_bound =
    { -126.99999f, -126.99999f, -126.99999f, -126.99999f };
  static const dt_aligned_pixel_t upper_bound =
    {  129.00000f,  129.00000f,  129.00000f,  129.00000f };
  static const dt_aligned_pixel_t v_half = { 0.5f, 0.5f, 0.5f, 0.5f };
  dt_aligned_pixel_t x;
  dt_vector_min(x, input, upper_bound);
  dt_vector_max(x, x, lower_bound);

  dt_aligned_pixel_t x_adj;
  for_four_channels(c)
    x_adj[c] = x[c] - v_half[c];
  dt_aligned_pixel_t ipart;
  dt_vector_round(x_adj, ipart);
  dt_aligned_pixel_t fpart;
  for_four_channels(c)
    fpart[c] = x[c] - ipart[c];

  union { uint32_t i[4]; float f[4]; } expipart;
  for_four_channels(c)
    expipart.i[c] = (127 + (int)ipart[c]) << 23;

  dt_aligned_pixel_t expfpart;
  for_four_channels(c)
  {
    expfpart[c] = ((((1.3534167e-2f * fpart[c] + 5.2011464e-2f)
                     * fpart[c] + 2.4144275e-1f)
                    * fpart[c] + 6.9300383e-1f)
                   * fpart[c] + 1.0000026f);
  }
  for_four_channels(c)
    res[c] = expipart.f[c] * expfpart[c];
}

static inline void dt_vector_powf(const dt_aligned_pixel_t input,
                                  const dt_aligned_pixel_t power,
                                  dt_aligned_pixel_t output)
{
  dt_aligned_pixel_t log;
  dt_vector_log2(input, log);
  for_four_channels(c)
    log[c] *= power[c];
  dt_vector_exp2(log, output);
}

static inline void dt_vector_clipneg(dt_aligned_pixel_t values)
{
  static const dt_aligned_pixel_t zero = { 0.0f, 0.0f, 0.0f, 0.0f };
  dt_vector_max(values, values, zero);
}

static inline float deg2radf(const float deg)
{
  return deg * M_PI_F / 180.f;
}

static inline float dt_fast_hypotf(const float x, const float y)
{
  return sqrtf(x * x + y * y);
}

static inline void copy_pixel(dt_aligned_pixel_t out, const dt_aligned_pixel_t in)
{
  for_four_channels(k) out[k] = in[k];
}

// ── common/chromatic_adaptation.h (verbatim) ────────────────────────────────

static const dt_colormatrix_t XYZ_D50_to_D65_CAT16
    = { { 9.89466254e-01f, -4.00304626e-02f, 4.40530317e-02f, 0.f },
        { -5.40518733e-03f, 1.00666069e+00f, -1.75551955e-03f, 0.f },
        { -4.03920992e-04f, 1.50768030e-02f, 1.30210211e+00f, 0.f } };

static const dt_colormatrix_t XYZ_D65_to_D50_CAT16
    = { { 1.01085433e+00f, 4.07086103e-02f, -3.41445825e-02f, 0.f },
        { 5.42814201e-03f, 9.93581926e-01f, 1.15592039e-03f, 0.f },
        { 2.50722468e-04f, -1.14918759e-02f, 7.67964947e-01f, 0.f } };

// ── common/colorspaces_inline_conversions.h (verbatim) ──────────────────────

static inline void dt_apply_transposed_color_matrix(const dt_aligned_pixel_t in, const dt_colormatrix_t matrix,
                                                    dt_aligned_pixel_t out)
{
  for_each_channel(r)
    out[r] = matrix[0][r] * in[0] + matrix[1][r] * in[1] + matrix[2][r] * in[2];
}

static inline void dt_D65_XYZ_to_xyY(const dt_aligned_pixel_t sXYZ, dt_aligned_pixel_t xyY)
{
  static const dt_aligned_pixel_t zero = { 0.0f, 0.0f, 0.0f, 0.0f };
  dt_aligned_pixel_t XYZ;
  dt_vector_max(XYZ, sXYZ, zero);

  const float sum = XYZ[0] + XYZ[1] + XYZ[2];
  xyY[0] = (sum > 0.0f) ? XYZ[0] / sum : (float)D65xyY.x;
  xyY[1] = (sum > 0.0f) ? XYZ[1] / sum : (float)D65xyY.y;
  xyY[2] = XYZ[1];
}

static inline void dt_xyY_to_XYZ(const dt_aligned_pixel_t xyY, dt_aligned_pixel_t XYZ)
{
  const gboolean bad = xyY[1] == 0.0f;
  XYZ[0] = bad ? 0.0f : xyY[2] * xyY[0] / xyY[1];
  XYZ[1] = bad ? 0.0f : xyY[2];
  XYZ[2] = bad ? 0.0f : xyY[2] * (1.f - xyY[0] - xyY[1]) / xyY[1];
}

static inline void dt_XYZ_2_JzAzBz(const dt_aligned_pixel_t XYZ_D65, dt_aligned_pixel_t JzAzBz)
{
  const float b = 1.15f;
  const float g = 0.66f;
  const float c1 = 0.8359375f; // 3424 / 2^12
  const float c2 = 18.8515625f; // 2413 / 2^7
  const float c3 = 18.6875f; // 2392 / 2^7
  const float n = 0.159301758f; // 2610 / 2^14
  const float p = 134.034375f; // 1.7 x 2523 / 2^5
  const float d = -0.56f;
  const float d0 = 1.6295499532821566e-11f;
  static const dt_colormatrix_t M_transposed = {
      { 0.41478972f, -0.2015100f, -0.0166008f, 0.0f },
      { 0.57999900f,  1.1206490f,  0.2648000f, 0.0f },
      { 0.01464800f,  0.0531008f,  0.6684799f, 0.0f },
  };
  static const dt_colormatrix_t A_transposed = {
      { 0.5f,       3.524000f,  0.199076f, 0.0f },
      { 0.5f,      -4.066708f,  1.096799f, 0.0f },
      { 0.0f,       0.542708f, -1.295875f, 0.0f },
  };

  dt_aligned_pixel_t XYZ = { 0.0f, 0.0f, 0.0f, 0.0f };

  // XYZ -> X'Y'Z
  XYZ[0] = b * XYZ_D65[0] - (b - 1.0f) * XYZ_D65[2];
  XYZ[1] = g * XYZ_D65[1] - (g - 1.0f) * XYZ_D65[0];
  XYZ[2] = XYZ_D65[2];

  // X'Y'Z -> L'M'S'
  dt_aligned_pixel_t LMS = { 0.0f, 0.0f, 0.0f, 0.0f };
  dt_apply_transposed_color_matrix(XYZ, M_transposed, LMS);
  for(int i = 0; i < 3; i++)
  {
    if(pq_in_double)
    {
      const double x = pow(fmax((double)LMS[i] / 10000.0, 0.0), 0.159301758);
      LMS[i] = (float)pow((0.8359375 + 18.8515625 * x) / (1.0 + 18.6875 * x), 134.034375);
      continue;
    }
    LMS[i] = powf(fmaxf(LMS[i] / 10000.f, 0.0f), n);
    LMS[i] = powf((c1 + c2 * LMS[i]) / (1.0f + c3 * LMS[i]), p);
  }

  // L'M'S' -> Izazbz
  dt_apply_transposed_color_matrix(LMS, A_transposed, JzAzBz);
  // Iz -> Jz
  JzAzBz[0] = fmaxf(((1.0f + d) * JzAzBz[0]) / (1.0f + d * JzAzBz[0]) - d0, 0.f);
}

static inline void dt_JzAzBz_2_XYZ(const dt_aligned_pixel_t JzAzBz, dt_aligned_pixel_t XYZ_D65)
{
  const float b = 1.15f;
  const float g = 0.66f;
  const float c1 = 0.8359375f; // 3424 / 2^12
  const float c2 = 18.8515625f; // 2413 / 2^7
  const float c3 = 18.6875f; // 2392 / 2^7
  const float n_inv = 1.0f / 0.159301758f; // 2610 / 2^14
  const float p_inv = 1.0f / 134.034375f; // 1.7 x 2523 / 2^5
  const float d = -0.56f;
  const float d0 = 1.6295499532821566e-11f;
  static const dt_colormatrix_t AI_trans = {
      {  1.0f,                 1.0f,                 1.0f,                0.0f },
      {  0.1386050432715393f, -0.1386050432715393f, -0.0960192420263190f, 0.0f },
      {  0.0580473161561189f, -0.0580473161561189f, -0.8118918960560390f, 0.0f },
  };
  static const dt_colormatrix_t MI_trans = {
      {  1.9242264357876067f,  0.3503167620949991f, -0.0909828109828475f, 0.0f },
      { -1.0047923125953657f,  0.7264811939316552f, -0.3127282905230739f, 0.0f },
      {  0.0376514040306180f, -0.0653844229480850f,  1.5227665613052603f, 0.0f },
  };

  dt_aligned_pixel_t IzAzBz = { 0.0f, 0.0f, 0.0f, 0.0f };
  IzAzBz[0] = JzAzBz[0] + d0;
  IzAzBz[0] = fmaxf(IzAzBz[0] / (1.0f + d - d * IzAzBz[0]), 0.f);
  IzAzBz[1] = JzAzBz[1];
  IzAzBz[2] = JzAzBz[2];

  dt_aligned_pixel_t LMS;
  dt_apply_transposed_color_matrix(IzAzBz, AI_trans, LMS);
  dt_vector_clipneg(LMS);
  if(pq_in_double)
  {
    for(int i = 0; i < 3; i++)
    {
      const double L = pow((double)LMS[i], 1.0 / 134.034375);
      const double x = fmax((0.8359375 - L) / (18.6875 * L - 18.8515625), 0.0);
      LMS[i] = (float)(10000.0 * pow(x, 1.0 / 0.159301758));
    }
    dt_aligned_pixel_t XYZ;
    dt_apply_transposed_color_matrix(LMS, MI_trans, XYZ);
    XYZ_D65[0] = (XYZ[0] + (b - 1.0f) * XYZ[2]) / b;
    XYZ_D65[1] = (XYZ[1] + (g - 1.0f) * XYZ_D65[0]) / g;
    XYZ_D65[2] = XYZ[2];
    XYZ_D65[3] = JzAzBz[3];
    return;
  }
  for_each_channel(i, aligned(LMS))
  {
    LMS[i] = powf(LMS[i], p_inv);
  }
  for(int i = 0; i < 3; i++)
  {
    LMS[i] = (c1 - LMS[i]) / (c3 * LMS[i] - c2);
  }
  dt_vector_clipneg(LMS);
  for_each_channel(i, aligned(LMS))
  {
    LMS[i] = 10000.f * powf(LMS[i], n_inv);
  }

  // LMS -> X'Y'Z
  dt_aligned_pixel_t XYZ;
  dt_apply_transposed_color_matrix(LMS, MI_trans, XYZ);

  // X'Y'Z -> XYZ_D65
  XYZ_D65[0] = (XYZ[0] + (b - 1.0f) * XYZ[2]) / b;
  XYZ_D65[1] = (XYZ[1] + (g - 1.0f) * XYZ_D65[0]) / g;
  XYZ_D65[2] = XYZ[2];
  XYZ_D65[3] = JzAzBz[3];
}

static const dt_colormatrix_t XYZ_D65_to_LMS_2006_D65
    = { { 0.257085f, 0.859943f, -0.031061f, 0.f },
        { -0.394427f, 1.175800f, 0.106423f, 0.f },
        { 0.064856f, -0.076250f, 0.559067f, 0.f } };

static const dt_colormatrix_t LMS_2006_D65_to_XYZ_D65_trans
    = { {  1.80794659f,  0.61783960f, -0.12546960f, 0.f },
        { -1.29971660f,  0.39595453f,  0.20478038f, 0.f },
        {  0.34785879f, -0.04104687f,  1.74274183f, 0.f } };

static inline void LMS_to_XYZ(const dt_aligned_pixel_t LMS, dt_aligned_pixel_t XYZ)
{
  dt_apply_transposed_color_matrix(LMS, LMS_2006_D65_to_XYZ_D65_trans, XYZ);
}

static const dt_colormatrix_t filmlightRGB_D65_to_LMS_D65_trans
    = { { 0.95f, 0.05f, 0.00f, 0.f },
        { 0.38f, 0.62f, 0.00f, 0.f },
        { 0.00f, 0.03f, 0.97f, 0.f } };

static const dt_colormatrix_t LMS_D65_to_filmlightRGB_D65_trans
    = { {  1.08771930f, -0.0877193f,          0.f, 0.f },
        { -0.66666667f,  1.66666667f,         0.f, 0.f },
        {  0.02061856f, -0.05154639f, 1.03092784f, 0.f } };

static inline void gradingRGB_to_LMS(const dt_aligned_pixel_t RGB, dt_aligned_pixel_t LMS)
{
  dt_apply_transposed_color_matrix(RGB, filmlightRGB_D65_to_LMS_D65_trans, LMS);
}

static inline void LMS_to_gradingRGB(const dt_aligned_pixel_t LMS, dt_aligned_pixel_t RGB)
{
  dt_apply_transposed_color_matrix(LMS, LMS_D65_to_filmlightRGB_D65_trans, RGB);
}

static inline void LMS_to_Yrg(const dt_aligned_pixel_t LMS, dt_aligned_pixel_t Yrg)
{
  // compute luminance
  const float Y = 0.68990272f * LMS[0] + 0.34832189f * LMS[1];

  // normalize LMS
  const float a = LMS[0] + LMS[1] + LMS[2];
  dt_aligned_pixel_t lms = { 0.f };
  for_four_channels(c, aligned(LMS, lms : 16)) lms[c] = (a == 0.f) ? 0.f : LMS[c] / a;

  // convert to Filmlight rgb (normalized)
  dt_aligned_pixel_t rgb = { 0.f };
  LMS_to_gradingRGB(lms, rgb);

  Yrg[0] = Y;
  Yrg[1] = rgb[0];
  Yrg[2] = rgb[1];
}

static inline void Yrg_to_LMS(const dt_aligned_pixel_t Yrg, dt_aligned_pixel_t LMS)
{
  const float Y = Yrg[0];

  // reform rgb (normalized) from chroma
  const float r = Yrg[1];
  const float g = Yrg[2];
  const float b = 1.f - r - g;
  const dt_aligned_pixel_t rgb = { r, g, b, 0.f };

  // convert to lms (normalized)
  dt_aligned_pixel_t lms = { 0.f };
  gradingRGB_to_LMS(rgb, lms);

  // denormalize to LMS
  const float denom = (0.68990272f * lms[0] + 0.34832189f * lms[1]);
  const float a = (denom == 0.f) ? 0.f : Y / denom;
  for_four_channels(c, aligned(lms, LMS:16)) LMS[c] = lms[c] * a;
}

static inline void Yrg_to_Ych(const dt_aligned_pixel_t Yrg, dt_aligned_pixel_t Ych)
{
  const float Y = Yrg[0];
  const float r = Yrg[1] - 0.21902143f;
  const float g = Yrg[2] - 0.54371398f;
  const float c = dt_fast_hypotf(g, r);
  const float cos_h = c != 0.f ? r / c : 1.f;
  const float sin_h = c != 0.f ? g / c : 0.f;
  Ych[0] = Y;
  Ych[1] = c;
  Ych[2] = cos_h;
  Ych[3] = sin_h;
}

static inline void Ych_to_Yrg(const dt_aligned_pixel_t Ych, dt_aligned_pixel_t Yrg)
{
  const float Y = Ych[0];
  const float c = Ych[1];
  const float cos_h = Ych[2];
  const float sin_h = Ych[3];
  const float r = c * cos_h + 0.21902143f;
  const float g = c * sin_h + 0.54371398f;
  Yrg[0] = Y;
  Yrg[1] = r;
  Yrg[2] = g;
}

static inline void make_Ych(const float Y, const float c, const float h, dt_aligned_pixel_t Ych)
{
  Ych[0] = Y;
  Ych[1] = c;
  Ych[2] = cosf(h);
  Ych[3] = sinf(h);
}

static inline void Ych_to_gradingRGB(const dt_aligned_pixel_t Ych, dt_aligned_pixel_t RGB)
{
  dt_aligned_pixel_t Yrg = { 0.f };
  dt_aligned_pixel_t LMS = { 0.f };
  Ych_to_Yrg(Ych, Yrg);
  Yrg_to_LMS(Yrg, LMS);
  LMS_to_gradingRGB(LMS, RGB);
}

static inline void gamut_check_Yrg(dt_aligned_pixel_t Ych)
{
  dt_aligned_pixel_t Yrg = { 0.f };
  Ych_to_Yrg(Ych, Yrg);

  const float D65_r = 0.21902143f;
  const float D65_g = 0.54371398f;

  float max_c = Ych[1];
  const float cos_h = Ych[2];
  const float sin_h = Ych[3];

  if(Yrg[1] < 0.f)
  {
    max_c = fminf(-D65_r / cos_h, max_c);
  }
  if(Yrg[2] < 0.f)
  {
    max_c = fminf(-D65_g / sin_h, max_c);
  }
  if(Yrg[1] + Yrg[2] > 1.f)
  {
    max_c = fminf((1.f - D65_r - D65_g) / (cos_h + sin_h), max_c);
  }

  Ych[1] = max_c;
}

#define DT_UCS_L_STAR_RANGE 2.098883786377f
#define DT_UCS_L_STAR_UPPER_LIMIT 2.09885f
#define DT_UCS_Y_UPPER_LIMIT 1e8f

static inline float Y_to_dt_UCS_L_star(const float Y)
{
  const float Y_hat = powf(Y, 0.631651345306265f);
  return DT_UCS_L_STAR_RANGE * Y_hat / (Y_hat + 1.12426773749357f);
}

static inline float dt_UCS_L_star_to_Y(const float L_star)
{
  return powf((1.12426773749357f * L_star / (DT_UCS_L_STAR_RANGE - L_star)), 1.5831518565279648f);
}

static inline void xyY_to_dt_UCS_UV(const dt_aligned_pixel_t xyY, float UV_star_prime[2])
{
  const dt_aligned_pixel_t x_factors = { -0.783941002840055f,  0.745273540913283f, 0.318707282433486f, 0.f };
  const dt_aligned_pixel_t y_factors = {  0.277512987809202f, -0.205375866083878f, 2.16743692732158f,  0.f };
  const dt_aligned_pixel_t offsets   = {  0.153836578598858f, -0.165478376301988f, 0.291320554395942f, 0.f };

  dt_aligned_pixel_t UVD = { 0.f };
  for_each_channel(c, aligned(xyY, UVD, x_factors, y_factors, offsets))
    UVD[c] = x_factors[c] * xyY[0] + y_factors[c] * xyY[1] + offsets[c];

  const float div = (UVD[2] >= 0.0f) ? MAX(FLT_MIN, UVD[2]) : MIN(-FLT_MIN, UVD[2]);
  UVD[0] /= div;
  UVD[1] /= div;

  float UV_star[2] = { 0.f };
  const float factors[2]     = { 1.39656225667f, 1.4513954287f };
  const float half_values[2] = { 1.49217352929f, 1.52488637914f };
  for(int c = 0; c < 2; c++)
    UV_star[c] = factors[c] * UVD[c] / (fabsf(UVD[c]) + half_values[c]);

  UV_star_prime[0] = -1.124983854323892f * UV_star[0] - 0.980483721769325f * UV_star[1];
  UV_star_prime[1] =  1.86323315098672f  * UV_star[0] + 1.971853092390862f * UV_star[1];
}

static inline void dt_UCS_LUV_to_JCH(const float L_star, const float L_white, const float UV_star_prime[2], dt_aligned_pixel_t JCH)
{
  const float M2 = UV_star_prime[0] * UV_star_prime[0] + UV_star_prime[1] * UV_star_prime[1]; // square of colorfulness M

  JCH[0] = L_star / L_white;
  JCH[1] = 15.932993652962535f * powf(L_star, 0.6523997524738018f) * powf(M2, 0.6007557017508491f) / L_white;
  JCH[2] = atan2f(UV_star_prime[1], UV_star_prime[0]);
}

static inline void xyY_to_dt_UCS_JCH(const dt_aligned_pixel_t xyY, const float L_white, dt_aligned_pixel_t JCH)
{
  float UV_star_prime[2];
  xyY_to_dt_UCS_UV(xyY, UV_star_prime);
  dt_UCS_LUV_to_JCH(Y_to_dt_UCS_L_star(xyY[2]), L_white, UV_star_prime, JCH);
}

static inline void dt_UCS_JCH_to_xyY(const dt_aligned_pixel_t JCH, const float L_white, dt_aligned_pixel_t xyY)
{
  const float L_star = CLAMPF(JCH[0] * L_white, 0.f, DT_UCS_L_STAR_UPPER_LIMIT);
  const float M = L_star != 0.f
    ? powf(JCH[1] * L_white / (15.932993652962535f * powf(L_star, 0.6523997524738018f)), 0.8322850678616855f)
    : 0.f;

  const float U_star_prime = M * cosf(JCH[2]);
  const float V_star_prime = M * sinf(JCH[2]);

  const float UV_star[2] = { -5.037522385190711f * U_star_prime - 2.504856328185843f * V_star_prime,
                              4.760029407436461f * U_star_prime + 2.874012963239247f * V_star_prime };

  float UV[2] = { 0.f };
  const float factors[2]     = { 1.39656225667f, 1.4513954287f };
  const float half_values[2] = { 1.49217352929f, 1.52488637914f };
  for(int c = 0; c < 2; c++)
    UV[c] = -half_values[c] * UV_star[c] / (fabsf(UV_star[c]) - factors[c]);

  const dt_aligned_pixel_t U_factors = {  0.167171472114775f,   -0.150959086409163f,    0.940254742367256f,  0.f };
  const dt_aligned_pixel_t V_factors = {  0.141299802443708f,   -0.155185060382272f,    1.000000000000000f,  0.f };
  const dt_aligned_pixel_t offsets   = { -0.00801531300850582f, -0.00843312433578007f, -0.0256325967652889f, 0.f };

  dt_aligned_pixel_t xyD = { 0.f };
  for_each_channel(c, aligned(xyD, UV, U_factors, V_factors, offsets))
    xyD[c] = U_factors[c] * UV[0] + V_factors[c] * UV[1] + offsets[c];

  const float div = (xyD[2] >= 0.0f) ? MAX(FLT_MIN, xyD[2]) : MIN(-FLT_MIN, xyD[2]);
  xyY[0] = xyD[0] / div;
  xyY[1] = xyD[1] / div;
  xyY[2] = dt_UCS_L_star_to_Y(L_star);
}

static inline void dt_UCS_JCH_to_HSB(const dt_aligned_pixel_t JCH, dt_aligned_pixel_t HSB)
{
  HSB[2] = JCH[0] * (powf(JCH[1], 1.33654221029386f) + 1.f);
  HSB[1] = (HSB[2] > 0.f) ? JCH[1] / HSB[2] : 0.f;
  HSB[0] = JCH[2];
}

static inline void dt_UCS_HSB_to_JCH(const dt_aligned_pixel_t HSB, dt_aligned_pixel_t JCH)
{
  JCH[2] = HSB[0];
  JCH[1] = HSB[1] * HSB[2];
  JCH[0] = HSB[2] / (powf(JCH[1], 1.33654221029386f) + 1.f);
}

static inline void dt_UCS_JCH_to_HCB(const dt_aligned_pixel_t JCH, dt_aligned_pixel_t HCB)
{
  HCB[2] = JCH[0] * (powf(JCH[1], 1.33654221029386f) + 1.f);
  HCB[1] = JCH[1];
  HCB[0] = JCH[2];
}

static inline void dt_UCS_HCB_to_JCH(const dt_aligned_pixel_t HCB, dt_aligned_pixel_t JCH)
{
  JCH[2] = HCB[0];
  JCH[1] = HCB[1];
  JCH[0] = HCB[2] / (powf(HCB[1], 1.33654221029386f) + 1.f);
}

// ── common/darktable_ucs_22_helpers.h (verbatim) ────────────────────────────

static inline float Delta_H(const float h_1, const float h_2)
{
  float diff = h_1 - h_2;
  diff += (diff < -M_PI_F) ? DT_2PI_F : 0.f;
  diff -= (diff > M_PI_F) ? DT_2PI_F : 0.f;
  return diff;
}

static inline void dt_UCS_22_build_gamut_LUT(dt_colormatrix_t input_matrix, float gamut_LUT[LUT_ELEM])
{
  for(size_t k = 0; k < LUT_ELEM; k++) gamut_LUT[k] = 0.f;
  float *const sampler = (float *)calloc(LUT_ELEM, sizeof(float));

  dt_aligned_pixel_t D65_xyY = { (float)D65xyY.x, (float)D65xyY.y, 1.f, 0.f };

  dt_aligned_pixel_t RGB_red   = { 1.f, 0.f, 0.f, 0.f };
  dt_aligned_pixel_t RGB_green = { 0.f, 1.f, 0.f, 0.f };
  dt_aligned_pixel_t RGB_blue =  { 0.f, 0.f, 1.f, 0.f };

  dt_aligned_pixel_t XYZ_red, XYZ_green, XYZ_blue;
  dot_product(RGB_red, input_matrix, XYZ_red);
  dot_product(RGB_green, input_matrix, XYZ_green);
  dot_product(RGB_blue, input_matrix, XYZ_blue);

  dt_aligned_pixel_t xyY_red, xyY_green, xyY_blue;
  dt_D65_XYZ_to_xyY(XYZ_red, xyY_red);
  dt_D65_XYZ_to_xyY(XYZ_green, xyY_green);
  dt_D65_XYZ_to_xyY(XYZ_blue, xyY_blue);

  const float h_red   = atan2f(xyY_red[1] - D65_xyY[1], xyY_red[0] - D65_xyY[0]);
  const float h_green = atan2f(xyY_green[1] - D65_xyY[1], xyY_green[0] - D65_xyY[0]);
  const float h_blue  = atan2f(xyY_blue[1] - D65_xyY[1], xyY_blue[0] - D65_xyY[0]);

  for(int i = 0; i < 50 * LUT_ELEM; i++)
  {
    const float angle = -M_PI_F + ((float)i) / (float)(50 * LUT_ELEM) * DT_2PI_F;
    const float tan_angle = tanf(angle);

    const float t_1 = Delta_H(angle, h_blue)  / Delta_H(h_red, h_blue);
    const float t_2 = Delta_H(angle, h_red)   / Delta_H(h_green, h_red);
    const float t_3 = Delta_H(angle, h_green) / Delta_H(h_blue, h_green);

    float x_t = 0;
    float y_t = 0;

    if(t_1 == CLAMP(t_1, 0, 1))
    {
      const float t = (D65_xyY[1] - xyY_blue[1] + tan_angle * (xyY_blue[0] - D65_xyY[0]))
                / (xyY_red[1] - xyY_blue[1] + tan_angle * (xyY_blue[0] - xyY_red[0]));
      x_t = xyY_blue[0] + t * (xyY_red[0] - xyY_blue[0]);
      y_t = xyY_blue[1] + t * (xyY_red[1] - xyY_blue[1]);
    }
    else if(t_2 == CLAMP(t_2, 0, 1))
    {
      const float t = (D65_xyY[1] - xyY_red[1] + tan_angle * (xyY_red[0] - D65_xyY[0]))
                / (xyY_green[1] - xyY_red[1] + tan_angle * (xyY_red[0] - xyY_green[0]));
      x_t = xyY_red[0] + t * (xyY_green[0] - xyY_red[0]);
      y_t = xyY_red[1] + t * (xyY_green[1] - xyY_red[1]);
    }
    else if(t_3 == CLAMP(t_3, 0, 1))
    {
      const float t = (D65_xyY[1] - xyY_green[1] + tan_angle * (xyY_green[0] - D65_xyY[0]))
                    / (xyY_blue[1] - xyY_green[1] + tan_angle * (xyY_green[0] - xyY_blue[0]));
      x_t = xyY_green[0] + t * (xyY_blue[0] - xyY_green[0]);
      y_t = xyY_green[1] + t * (xyY_blue[1] - xyY_green[1]);
    }

    dt_aligned_pixel_t xyY = { x_t, y_t, 1.f, 0.f };
    float UV_star_prime[2];
    xyY_to_dt_UCS_UV(xyY, UV_star_prime);

    const float hue = atan2f(UV_star_prime[1], UV_star_prime[0]);
    int index = roundf((float)(LUT_ELEM - 1) * (hue + M_PI_F) / DT_2PI_F);
    index += (index < 0) ? LUT_ELEM : 0;
    index -= (index >= LUT_ELEM) ? LUT_ELEM : 0;
    gamut_LUT[index] += UV_star_prime[0] * UV_star_prime[0] + UV_star_prime[1] * UV_star_prime[1];
    sampler[index] += 1.0f;
  }
  for(size_t k = 0; k < LUT_ELEM; k++)
    gamut_LUT[k] = gamut_LUT[k] / fmaxf(1.0f, sampler[k]);
  free(sampler);
}

static inline float lookup_gamut(const float gamut_lut[LUT_ELEM], const float hue)
{
  const float x_test = (float)LUT_ELEM * (hue + M_PI_F) / DT_2PI_F;

  const float x_prev = floor(x_test);
  const float x_next = ceil(x_test);

  const int xi = (int)x_prev & (LUT_ELEM - 1);
  const int xii = (int)x_next & (LUT_ELEM - 1);
  const float y_prev = gamut_lut[xi];

  return y_prev + ((xi != xii) ? (x_test - x_prev) * (gamut_lut[xii] - y_prev) : 0.0f);
}

static inline float soft_clip(const float x, const float soft_threshold, const float hard_threshold)
{
  const float norm = hard_threshold - soft_threshold;
  return (x > soft_threshold) ? soft_threshold + (1.f - expf(-(x - soft_threshold) / norm)) * norm : x;
}

// ── iop/colorbalancergb.c (verbatim but for the GUI, the mask display and
//    the pipe plumbing) ──────────────────────────────────────────────────────

#define STEPS 92
#define ANGLE_SHIFT -30.f
#define CONVENTIONAL_DEG_TO_YRG_RAD(x) (deg2radf(x + ANGLE_SHIFT))

typedef enum dt_iop_colorbalancrgb_saturation_t
{
  DT_COLORBALANCE_SATURATION_JZAZBZ = 0,
  DT_COLORBALANCE_SATURATION_DTUCS = 1
} dt_iop_colorbalancrgb_saturation_t;

typedef struct dt_iop_colorbalancergb_params_t
{
  float shadows_Y, shadows_C, shadows_H;
  float midtones_Y, midtones_C, midtones_H;
  float highlights_Y, highlights_C, highlights_H;
  float global_Y, global_C, global_H;
  float shadows_weight;
  float white_fulcrum;
  float highlights_weight;
  float chroma_shadows;
  float chroma_highlights;
  float chroma_global;
  float chroma_midtones;
  float saturation_global;
  float saturation_highlights;
  float saturation_midtones;
  float saturation_shadows;
  float hue_angle;
  float brilliance_global;
  float brilliance_highlights;
  float brilliance_midtones;
  float brilliance_shadows;
  float mask_grey_fulcrum;
  float vibrance;
  float grey_fulcrum;
  float contrast;
  dt_iop_colorbalancrgb_saturation_t saturation_formula;
} dt_iop_colorbalancergb_params_t;

typedef struct dt_iop_colorbalancergb_data_t
{
  float global[4];
  float shadows[4];
  float highlights[4];
  float midtones[4];
  float midtones_Y;
  float chroma_global, chroma[4], vibrance, contrast;
  float saturation_global, saturation[4];
  float brilliance_global, brilliance[4];
  float hue_angle;
  float shadows_weight, highlights_weight, midtones_weight, mask_grey_fulcrum;
  float white_fulcrum, grey_fulcrum;
  float gamut_LUT[LUT_ELEM];
  dt_iop_colorbalancrgb_saturation_t saturation_formula;
} dt_iop_colorbalancergb_data_t;

static dt_iop_colorbalancergb_params_t default_params()
{
  dt_iop_colorbalancergb_params_t p;
  memset(&p, 0, sizeof(p));
  p.shadows_weight = 1.f;
  p.highlights_weight = 1.f;
  p.mask_grey_fulcrum = 0.1845f;
  p.grey_fulcrum = 0.1845f;
  p.saturation_formula = DT_COLORBALANCE_SATURATION_DTUCS;
  return p;
}

struct named_params { const char *name; dt_iop_colorbalancergb_params_t p; };

// init_presets, the four "basic colorfulness" presets in order.
static std::vector<named_params> init_presets()
{
  std::vector<named_params> out;
  dt_iop_colorbalancergb_params_t p;
  memset(&p, 0, sizeof(p));
  p.shadows_weight = 1.f;
  p.highlights_weight = 1.f;
  p.mask_grey_fulcrum = 0.1845f;
  p.grey_fulcrum = 0.1845f;
  p.saturation_formula = DT_COLORBALANCE_SATURATION_JZAZBZ;

  p.chroma_global = 0.2f;
  p.saturation_shadows = 0.1f;
  p.saturation_midtones = 0.05f;
  p.saturation_highlights = -0.05f;
  out.push_back({ "preset: basic colorfulness | legacy", p });

  p.saturation_formula = DT_COLORBALANCE_SATURATION_DTUCS;
  p.chroma_global = 0.f;

  p.saturation_global = 0.2f;
  p.saturation_shadows = 0.30f;
  p.saturation_midtones = 0.f;
  p.saturation_highlights = -0.5f;
  out.push_back({ "preset: basic colorfulness | natural skin", p });

  p.saturation_global = 0.2f;
  p.saturation_shadows = 0.5f;
  p.saturation_midtones = 0.f;
  p.saturation_highlights = -0.25f;
  out.push_back({ "preset: basic colorfulness | vibrant colors", p });

  p.saturation_global = 0.2f;
  p.saturation_shadows = 0.25f;
  p.saturation_midtones = 0.f;
  p.saturation_highlights = -0.25f;
  out.push_back({ "preset: basic colorfulness | standard", p });
  return out;
}

static inline void opacity_masks(const float x,
                                 const float shadows_weight, const float highlights_weight,
                                 const float midtones_weight, const float mask_grey_fulcrum,
                                 dt_aligned_pixel_t output, dt_aligned_pixel_t output_comp)
{
  const float x_offset = (x - mask_grey_fulcrum);
  const float x_offset_norm = x_offset / mask_grey_fulcrum;
  const float alpha = 1.f / (1.f + expf(x_offset_norm * shadows_weight));    // opacity of shadows
  const float beta = 1.f / (1.f + expf(-x_offset_norm * highlights_weight)); // opacity of highlights
  const float alpha_comp = 1.f - alpha;
  const float beta_comp = 1.f - beta;
  const float gamma = expf(-sqf(x_offset) * midtones_weight / 4.f) * sqf(alpha_comp) * sqf(beta_comp) * 8.f; // opacity of midtones
  const float gamma_comp = 1.f - gamma;

  output[0] = alpha;
  output[1] = gamma;
  output[2] = beta;
  output[3] = 0.f;

  if(output_comp)
  {
    output_comp[0] = alpha_comp;
    output_comp[1] = gamma_comp;
    output_comp[2] = beta_comp;
    output_comp[3] = 0.f;
  }
}

struct work_profile_t { dt_colormatrix_t matrix_in, matrix_out; };

static void commit_params(const dt_iop_colorbalancergb_params_t *p, const work_profile_t *work_profile,
                          dt_iop_colorbalancergb_data_t *d)
{
  d->vibrance = p->vibrance;
  d->contrast = 1.0f + p->contrast;
  d->grey_fulcrum = p->grey_fulcrum;

  d->chroma_global = p->chroma_global;
  d->chroma[0] = p->chroma_shadows;
  d->chroma[1] = p->chroma_midtones;
  d->chroma[2] = p->chroma_highlights;
  d->chroma[3] = 0.f;

  d->saturation_global = p->saturation_global;
  d->saturation[0] = p->saturation_shadows;
  d->saturation[1] = p->saturation_midtones;
  d->saturation[2] = p->saturation_highlights;
  d->saturation[3] = 0.f;

  d->brilliance_global = p->brilliance_global;
  d->brilliance[0] = p->brilliance_shadows;
  d->brilliance[1] = p->brilliance_midtones;
  d->brilliance[2] = p->brilliance_highlights;
  d->brilliance[3] = 0.f;

  d->hue_angle = deg2radf(p->hue_angle);

  const dt_aligned_pixel_t Ych_norm = { 1.f, 0.f, 1.f, 0.f };
  dt_aligned_pixel_t RGB_norm = { 0.f };
  Ych_to_gradingRGB(Ych_norm, RGB_norm);
  dt_aligned_pixel_t Ych;

  {
    make_Ych(1.f, p->global_C, CONVENTIONAL_DEG_TO_YRG_RAD(p->global_H), Ych);
    Ych_to_gradingRGB(Ych, d->global);
    for(size_t c = 0; c < 4; c++) d->global[c] = (d->global[c] - RGB_norm[c]) + RGB_norm[c] * p->global_Y;
  }

  {
    make_Ych(1.f, p->shadows_C, CONVENTIONAL_DEG_TO_YRG_RAD(p->shadows_H), Ych);
    Ych_to_gradingRGB(Ych, d->shadows);
    for(size_t c = 0; c < 4; c++) d->shadows[c] = 1.f + (d->shadows[c] - RGB_norm[c]) + p->shadows_Y;
    d->shadows_weight = 2.f + p->shadows_weight * 2.f;
  }

  {
    make_Ych(1.f, p->highlights_C, CONVENTIONAL_DEG_TO_YRG_RAD(p->highlights_H), Ych);
    Ych_to_gradingRGB(Ych, d->highlights);
    for(size_t c = 0; c < 4; c++) d->highlights[c] = 1.f + (d->highlights[c] - RGB_norm[c]) + p->highlights_Y;
    d->highlights_weight = 2.f + p->highlights_weight * 2.f;
  }

  {
    make_Ych(1.f, p->midtones_C, CONVENTIONAL_DEG_TO_YRG_RAD(p->midtones_H), Ych);
    Ych_to_gradingRGB(Ych, d->midtones);
    for(size_t c = 0; c < 4; c++) d->midtones[c] = 1.f / (1.f + (d->midtones[c] - RGB_norm[c]));
    d->midtones_Y = 1.f / (1.f + p->midtones_Y);
    d->white_fulcrum = exp2f(p->white_fulcrum);
    d->midtones_weight = sqf(d->shadows_weight) * sqf(d->highlights_weight) /
      (sqf(d->shadows_weight) + sqf(d->highlights_weight));
    d->mask_grey_fulcrum = powf(p->mask_grey_fulcrum, 0.4101205819200422f);
  }

  d->saturation_formula = p->saturation_formula;

  dt_colormatrix_t input_matrix;
  dt_colormatrix_mul(input_matrix, XYZ_D50_to_D65_CAT16, work_profile->matrix_in);
  float *gamut_LUT = d->gamut_LUT;
  if(p->saturation_formula == DT_COLORBALANCE_SATURATION_JZAZBZ)
  {
    float *const sampler = (float *)calloc(LUT_ELEM, sizeof(float));
    for(size_t r = 0; r < STEPS; r++)
      for(size_t g = 0; g < STEPS; g++)
        for(size_t b = 0; b < STEPS; b++)
        {
          const dt_aligned_pixel_t rgb = { (float)r / (float)(STEPS - 1), (float)g / (float)(STEPS - 1),
                                          (float)b / (float)(STEPS - 1), 0.f };
          dt_aligned_pixel_t XYZ = { 0.f };
          float saturation = 0.f;
          float hue = 0.f;

          dot_product(rgb, input_matrix, XYZ);

          dt_aligned_pixel_t Jab, Jch;
          dt_XYZ_2_JzAzBz(XYZ, Jab);

          Jch[0] = Jab[0];
          Jch[1] = dt_fast_hypotf(Jab[2], Jab[1]);
          Jch[2] = atan2f(Jab[2], Jab[1]);

          saturation = (Jch[0] > 0.f) ? Jch[1] / Jch[0] : 0.f;
          hue = Jch[2];

          int index = roundf((LUT_ELEM - 1) * (hue + M_PI_F) / DT_2PI_F);
          index += (index < 0) ? LUT_ELEM : 0;
          index -= (index >= LUT_ELEM) ? LUT_ELEM : 0;
          sampler[index] = fmaxf(sampler[index], saturation);
        }

    for(size_t k = 2; k < LUT_ELEM - 2; k++)
      d->gamut_LUT[k] = (sampler[k - 2] + sampler[k - 1] + sampler[k] + sampler[k + 1] + sampler[k + 2]) / 5.f;

    d->gamut_LUT[0] = (sampler[LUT_ELEM - 2] + sampler[LUT_ELEM - 1] + sampler[0] + sampler[1] + sampler[2]) / 5.f;
    d->gamut_LUT[1] = (sampler[LUT_ELEM - 1] + sampler[0] + sampler[1] + sampler[2] + sampler[3]) / 5.f;
    d->gamut_LUT[LUT_ELEM - 1] = (sampler[LUT_ELEM - 3] + sampler[LUT_ELEM - 2] + sampler[LUT_ELEM - 1] + sampler[0] + sampler[1]) / 5.f;
    d->gamut_LUT[LUT_ELEM - 2] = (sampler[LUT_ELEM - 4] + sampler[LUT_ELEM - 3] + sampler[LUT_ELEM - 2] + sampler[LUT_ELEM - 1] + sampler[0]) / 5.f;
    free(sampler);
  }
  else if(p->saturation_formula == DT_COLORBALANCE_SATURATION_DTUCS)
    dt_UCS_22_build_gamut_LUT(input_matrix, gamut_LUT);
}

static void process(const dt_iop_colorbalancergb_data_t *d, const work_profile_t *work_profile,
                    const float *const in, float *const out, const size_t npixels)
{
  dt_colormatrix_t input_matrix = { { 0.0f } };
  dt_colormatrix_t output_matrix = { { 0.0f } };

  dt_colormatrix_mul(output_matrix, XYZ_D50_to_D65_CAT16, work_profile->matrix_in); // output_matrix used as temp buffer
  dt_colormatrix_mul(input_matrix, XYZ_D65_to_LMS_2006_D65, output_matrix);
  dt_colormatrix_t input_matrix_trans;
  dt_colormatrix_transpose(input_matrix_trans, input_matrix);

  dt_colormatrix_mul(output_matrix, work_profile->matrix_out, XYZ_D65_to_D50_CAT16);
  dt_colormatrix_t output_matrix_trans;
  dt_colormatrix_transpose(output_matrix_trans, output_matrix);

  const float *const gamut_LUT = d->gamut_LUT;

  const float *const global = d->global;
  const float *const highlights = d->highlights;
  const float *const shadows = d->shadows;
  const float *const midtones = d->midtones;

  const float *const chroma = d->chroma;
  const float *const saturation = d->saturation;
  const float *const brilliance = d->brilliance;

  const float L_white = Y_to_dt_UCS_L_star(d->white_fulcrum);

  const float hue_rotation_matrix[2][2] = {
    { cosf(d->hue_angle), -sinf(d->hue_angle) },
    { sinf(d->hue_angle),  cosf(d->hue_angle) },
  };

  for(size_t k  = 0; k < 4 * npixels; k += 4)
  {
    // clip pipeline RGB
    dt_aligned_pixel_t RGB;
    copy_pixel(RGB, in + k);
    dt_vector_clipneg(RGB);

    // go to CIE 2006 LMS D65
    dt_aligned_pixel_t LMS;
    dt_apply_transposed_color_matrix(RGB, input_matrix_trans, LMS);

    // go to Filmlight Yrg
    dt_aligned_pixel_t Yrg = { 0.f };
    LMS_to_Yrg(LMS, Yrg);

    // go to Ych
    dt_aligned_pixel_t Ych = { 0.f };
    Yrg_to_Ych(Yrg, Ych);

    // Sanitize input : no negative luminance
    Ych[0] = MAX(Ych[0], 0.f);

    // Opacities for luma masks
    dt_aligned_pixel_t opacities;
    dt_aligned_pixel_t opacities_comp;
    opacity_masks(powf(Ych[0], 0.4101205819200422f), // center middle grey in 50 %
                  d->shadows_weight, d->highlights_weight, d->midtones_weight,
                  d->mask_grey_fulcrum, opacities, opacities_comp);

    // Hue shift - do it now because we need the gamut limit at output hue right after
    const float cos_h = Ych[2];
    const float sin_h = Ych[3];
    Ych[2] = hue_rotation_matrix[0][0] * cos_h + hue_rotation_matrix[0][1] * sin_h;
    Ych[3] = hue_rotation_matrix[1][0] * cos_h + hue_rotation_matrix[1][1] * sin_h;

    // Linear chroma : distance to achromatic at constant luminance in scene-referred
    const float chroma_boost = d->chroma_global + scalar_product(opacities, chroma);
    const float vibrance = d->vibrance * (1.0f - powf(Ych[1], fabsf(d->vibrance)));
    const float chroma_factor = MAX(1.f + chroma_boost + vibrance, 0.f);
    Ych[1] *= chroma_factor;

    // clip chroma at constant hue and Y if needed
    gamut_check_Yrg(Ych);

    // go to Yrg for real
    Ych_to_Yrg(Ych, Yrg);

    // Go to LMS
    Yrg_to_LMS(Yrg, LMS);

    // Go to Filmlight RGB
    LMS_to_gradingRGB(LMS, RGB);

    // Color balance
    for_four_channels(c, aligned(RGB, global))
    {
      // global : offset
      RGB[c] += global[c];
    }
    for_four_channels(c, aligned(RGB, opacities, opacities_comp, shadows, midtones, highlights:16))
    {
      //  highlights, shadows : 2 slopes with masking
      RGB[c] *= opacities_comp[2] * (opacities_comp[0] + opacities[0] * shadows[c]) + opacities[2] * highlights[c];
    }
    dt_aligned_pixel_t sign;
    for_each_channel(c)
      sign[c] = (RGB[c] < 0.f) ? -1.f : 1.f;
    dt_aligned_pixel_t abs_RGB;
    for_each_channel(c)
      abs_RGB[c] = fabsf(RGB[c]);
    dt_aligned_pixel_t scaled_RGB;
    for_each_channel(c)
      scaled_RGB[c] = abs_RGB[c] /d->white_fulcrum;
    dt_vector_powf(scaled_RGB, midtones, RGB);
    for_each_channel(c)
      RGB[c] = RGB[c] * sign[c] * d->white_fulcrum;

    // for the non-linear ops we need to go in Yrg again because RGB doesn't preserve color
    gradingRGB_to_LMS(RGB, LMS);
    LMS_to_Yrg(LMS, Yrg);

    // Y midtones power (gamma)
    Yrg[0] = powf(MAX(Yrg[0] / d->white_fulcrum, 0.f), d->midtones_Y) * d->white_fulcrum;

    // Y fulcrumed contrast
    Yrg[0] = d->grey_fulcrum * powf(Yrg[0] / d->grey_fulcrum, d->contrast);

    Yrg_to_LMS(Yrg, LMS);
    dt_aligned_pixel_t XYZ_D65 = { 0.f };
    LMS_to_XYZ(LMS, XYZ_D65);

    // Perceptual color adjustments
    if(d->saturation_formula == DT_COLORBALANCE_SATURATION_JZAZBZ)
    {
      dt_aligned_pixel_t Jab = { 0.f };
      dt_XYZ_2_JzAzBz(XYZ_D65, Jab);

      // Convert to JCh
      float JC[2] = { Jab[0], dt_fast_hypotf(Jab[1], Jab[2]) };   // brightness/chroma vector
      const float h = atan2f(Jab[2], Jab[1]);  // hue : (a, b) angle

      const float T = atan2f(JC[1], JC[0]); // angle of the eigenvector over the hue plane
      const float sin_T = sinf(T);
      const float cos_T = cosf(T);
      const float M_rot_dir[2][2] = { {  cos_T,  sin_T },
                                      { -sin_T,  cos_T } };
      const float M_rot_inv[2][2] = { {  cos_T, -sin_T },
                                      {  sin_T,  cos_T } };
      float SO[2];

      // brilliance & Saturation : mix of chroma and luminance
      const float boosts[2] = { 1.f + d->brilliance_global + scalar_product(opacities, brilliance),     // move in S direction
                                d->saturation_global + scalar_product(opacities, saturation) }; // move in O direction

      SO[0] = JC[0] * M_rot_dir[0][0] + JC[1] * M_rot_dir[0][1];
      SO[1] = SO[0] * MIN(MAX(T * boosts[1], -T), M_PI_2f - T);
      SO[0] = MAX(SO[0] * boosts[0], 0.f);

      // Project back to JCh, that is rotate back of -T angle
      JC[0] = MAX(SO[0] * M_rot_inv[0][0] + SO[1] * M_rot_inv[0][1], 0.f);
      JC[1] = MAX(SO[0] * M_rot_inv[1][0] + SO[1] * M_rot_inv[1][1], 0.f);

      // Gamut mapping
      const float out_max_sat_h = lookup_gamut(gamut_LUT, h);
      const float sat = (JC[0] > 0.f) ? soft_clip(JC[1] / JC[0], 0.8f * out_max_sat_h, out_max_sat_h)
                                      : out_max_sat_h;
      const float max_C_at_sat = JC[0] * sat;
      const float max_J_at_sat = (sat > 0.f) ? JC[1] / sat : JC[0];
      JC[0] = (JC[0] + max_J_at_sat) / 2.f;
      JC[1] = (JC[1] + max_C_at_sat) / 2.f;

      const float cos_H = cosf(h);
      const float sin_H = sinf(h);

      const float d0 = 1.6295499532821566e-11f;
      const float dd = -0.56f;
      float Iz = JC[0] + d0;
      Iz /= (1.f + dd - dd * Iz);
      Iz = MAX(Iz, 0.f);

      static const dt_colormatrix_t AI_trans
          = { {  1.0f,                 1.0f,                                1.0f, 0.0f },
              {  0.1386050432715393f, -0.1386050432715393f, -0.0960192420263190f, 0.0f },
              {  0.0580473161561189f, -0.0580473161561189f, -0.8118918960560390f, 0.0f } };

      const dt_aligned_pixel_t IzAzBz = { Iz, JC[1] * cos_H, JC[1] * sin_H, 0.f };
      dt_apply_transposed_color_matrix(IzAzBz, AI_trans, LMS);

      float max_C = JC[1];
      if(LMS[0] < 0.f)
        max_C = MIN(-Iz / (AI_trans[1][0] * cos_H + AI_trans[2][0] * sin_H), max_C);

      if(LMS[1] < 0.f)
        max_C = MIN(-Iz / (AI_trans[1][1] * cos_H + AI_trans[2][1] * sin_H), max_C);

      if(LMS[2] < 0.f)
        max_C = MIN(-Iz / (AI_trans[1][2] * cos_H + AI_trans[2][2] * sin_H), max_C);

      Jab[0] = JC[0];
      Jab[1] = max_C * cos_H;
      Jab[2] = max_C * sin_H;

      dt_JzAzBz_2_XYZ(Jab, XYZ_D65);
    }
    else
    {
      dt_aligned_pixel_t xyY, JCH, HCB;
      dt_D65_XYZ_to_xyY(XYZ_D65, xyY);
      xyY_to_dt_UCS_JCH(xyY, L_white, JCH);
      dt_UCS_JCH_to_HCB(JCH, HCB);

      const float radius = dt_fast_hypotf(HCB[1], HCB[2]);
      const float sin_T = (radius > 0.f) ? HCB[1] / radius : 0.f;
      const float cos_T = (radius > 0.f) ? HCB[2] / radius : 0.f;
      const float M_rot_inv[2][2] = { { cos_T,  sin_T }, { -sin_T, cos_T } };

      const float P = MAX(FLT_MIN, HCB[1]); // as HCB[1] is at least zero we don't fiddle with sign
      const float W = sin_T * HCB[1] + cos_T * HCB[2];

      float a = MAX(1.f + d->saturation_global + scalar_product(opacities, saturation), 0.f);
      const float b = MAX(1.f + d->brilliance_global + scalar_product(opacities, brilliance), 0.f);

      const float max_a = dt_fast_hypotf(P, W) / P;
      a = soft_clip(a, 0.5f * max_a, max_a);

      const float P_prime = (a - 1.f) * P;
      const float W_prime = sqrtf(sqf(P) * (1.f - sqf(a)) + sqf(W)) * b;

      HCB[1] = MAX(M_rot_inv[0][0] * P_prime + M_rot_inv[0][1] * W_prime, 0.f);
      HCB[2] = MAX(M_rot_inv[1][0] * P_prime + M_rot_inv[1][1] * W_prime, 0.f);

      dt_UCS_HCB_to_JCH(HCB, JCH);

      // Gamut mapping
      const float max_colorfulness = lookup_gamut(gamut_LUT, JCH[2]); // WARNING : this is M²
      const float max_chroma = (15.932993652962535f * powf(JCH[0] * L_white, 0.6523997524738018f)
                                * powf(max_colorfulness, 0.6007557017508491f) / L_white);
      const dt_aligned_pixel_t JCH_gamut_boundary = { JCH[0], max_chroma, JCH[2], 0.f };
      dt_aligned_pixel_t HSB_gamut_boundary;
      dt_UCS_JCH_to_HSB(JCH_gamut_boundary, HSB_gamut_boundary);

      // Clip saturation at constant brightness
      dt_aligned_pixel_t HSB = { HCB[0], (HCB[2] > 0.f) ? HCB[1] / HCB[2] : 0.f, HCB[2], 0.f };
      HSB[1] = soft_clip(HSB[1], 0.8f * HSB_gamut_boundary[1], HSB_gamut_boundary[1]);

      dt_UCS_HSB_to_JCH(HSB, JCH);
      dt_UCS_JCH_to_xyY(JCH, L_white, xyY);
      dt_xyY_to_XYZ(xyY, XYZ_D65);
    }

    // Project back to D50 pipeline RGB
    dt_aligned_pixel_t pix_out;
    dt_apply_transposed_color_matrix(XYZ_D65, output_matrix_trans, pix_out);
    dt_vector_clipneg(pix_out);
    copy_pixel(out + k, pix_out);
  }
}

// ── the working profile: linear Rec.2020 as lcms builds it ──────────────────

typedef double mat3d[9];

static void mul3d(const mat3d a, const mat3d b, mat3d out)
{
  mat3d r;
  for(int i = 0; i < 3; i++)
    for(int j = 0; j < 3; j++) r[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
  memcpy(out, r, sizeof(r));
}

static void apply3d(const mat3d m, const double v[3], double out[3])
{
  for(int i = 0; i < 3; i++) out[i] = m[3 * i] * v[0] + m[3 * i + 1] * v[1] + m[3 * i + 2] * v[2];
}

static void inv3d(const mat3d m, mat3d out)
{
  const double a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  const double A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const double det = a * A + b * B + c * C;
  const mat3d r = { A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
                    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
                    C / det, -(a * h - b * g) / det, (a * e - b * d) / det };
  memcpy(out, r, sizeof(r));
}

// Channel Mixer's lcmsRgbToXyzD50: the primaries scaled to the white, then
// Bradford-adapted to lcms's D50.
static void lcms_rgb_to_xyz_d50(const double primaries[3][2], mat3d out)
{
  static const mat3d BRADFORD = { 0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296 };
  const double D50[3] = { 0.9642, 1.0, 0.8249 };
  const double wx = 0.312700492, wy = 0.329000939;
  const double W[3] = { wx / wy, 1.0, (1 - wx - wy) / wy };
  mat3d prim;
  for(int k = 0; k < 3; k++)
  {
    const double x = primaries[k][0], y = primaries[k][1];
    prim[k] = x / y;
    prim[3 + k] = 1.0;
    prim[6 + k] = (1 - x - y) / y;
  }
  mat3d prim_inv;
  inv3d(prim, prim_inv);
  double S[3];
  apply3d(prim_inv, W, S);
  mat3d rgb_to_xyz;
  for(int i = 0; i < 9; i++) rgb_to_xyz[i] = prim[i] * S[i % 3];
  double src[3], dst[3];
  apply3d(BRADFORD, W, src);
  apply3d(BRADFORD, D50, dst);
  mat3d scaled;
  for(int i = 0; i < 9; i++) scaled[i] = dst[i / 3] / src[i / 3] * BRADFORD[i];
  mat3d brad_inv;
  inv3d(BRADFORD, brad_inv);
  mat3d t;
  mul3d(brad_inv, scaled, t);
  mul3d(t, rgb_to_xyz, out);
}

static void to_colormatrix(const mat3d m, dt_colormatrix_t out)
{
  for(int i = 0; i < 4; i++)
    for(int j = 0; j < 4; j++) out[i][j] = (i < 3 && j < 3) ? (float)m[3 * i + j] : 0.f;
}

// ── the test pixels and cases ───────────────────────────────────────────────

static uint32_t rng_state = 0x2545F491u;
static float rnd()
{
  rng_state ^= rng_state << 13;
  rng_state ^= rng_state >> 17;
  rng_state ^= rng_state << 5;
  return (float)((rng_state >> 8) * (1.0 / 16777216.0));
}

static std::vector<float> make_pixels(const mat3d rec709_to_rec2020)
{
  std::vector<float> px;
  auto push = [&](float r, float g, float b) { px.push_back(r); px.push_back(g); px.push_back(b); };
  auto push709 = [&](double r, double g, double b) {
    const double v[3] = { r, g, b };
    double o[3];
    apply3d(rec709_to_rec2020, v, o);
    push((float)o[0], (float)o[1], (float)o[2]);
  };

  push(0.f, 0.f, 0.f);
  const float greys[] = { 1e-6f, 1e-4f, 1e-3f, 0.01f, 0.05f, 0.1845f, 0.5f, 1.f, 2.f, 4.f, 16.f, 64.f };
  for(float y : greys) push(y, y, y);

  const double hues[6][3] = { { 1, 0, 0 }, { 1, 1, 0 }, { 0, 1, 0 }, { 0, 1, 1 }, { 0, 0, 1 }, { 1, 0, 1 } };
  const double levels709[] = { 0.01, 0.18, 1.0, 4.0 };
  for(double l : levels709)
    for(const auto &h : hues) push709(h[0] * l, h[1] * l, h[2] * l);
  const float levels2020[] = { 0.01f, 0.18f, 1.f, 4.f, 16.f };
  for(float l : levels2020)
    for(const auto &h : hues) push((float)h[0] * l, (float)h[1] * l, (float)h[2] * l);

  // near-black saturated colours
  const float tiny[] = { 1e-5f, 1e-4f, 1e-3f };
  for(float t : tiny)
  {
    push(t, 0.f, 0.f);
    push(0.f, t, 0.f);
    push(0.f, 0.f, t);
    push(t, 0.5f * t, 0.1f * t);
    push(0.2f * t, 0.4f * t, t);
  }

  // negative channels (out of the working gamut)
  push(-0.1f, 0.5f, 0.2f);
  push(0.6f, -0.05f, 0.1f);
  push(0.3f, 0.2f, -0.2f);
  push(-0.01f, -0.02f, 0.4f);
  push(-1.f, -1.f, -1.f);
  push(2.f, -0.5f, 8.f);

  // skin and foliage, a few typical scene colours
  push709(0.55, 0.34, 0.25);
  push709(0.32, 0.18, 0.12);
  push709(0.08, 0.12, 0.03);
  push709(0.1, 0.2, 0.45);

  // the rest at random: log-uniform level from 2^-12 to 2^6, random mix,
  // some with a negative channel
  while(px.size() < 3 * 1000)
  {
    const float level = exp2f(-12.f + 18.f * rnd());
    float r = rnd(), g = rnd(), b = rnd();
    const float m = fmaxf(r, fmaxf(g, b));
    const float s = powf(rnd(), 0.5f);
    r = level * (1.f - s + s * r / m);
    g = level * (1.f - s + s * g / m);
    b = level * (1.f - s + s * b / m);
    if(rnd() < 0.05f) r = -0.1f * level * rnd();
    push(r, g, b);
  }
  return px;
}

static std::vector<named_params> make_cases()
{
  std::vector<named_params> cases;
  auto add = [&](const char *name, auto edit) {
    dt_iop_colorbalancergb_params_t p = default_params();
    edit(p);
    cases.push_back({ name, p });
  };
  typedef dt_iop_colorbalancergb_params_t P;
  const auto JZ = DT_COLORBALANCE_SATURATION_JZAZBZ;

  add("neutral, perceptual", [](P &) {});
  add("neutral, JzAzBz", [&](P &p) { p.saturation_formula = JZ; });
  add("chroma global +0.5", [](P &p) { p.chroma_global = 0.5f; });
  add("chroma global -0.6", [](P &p) { p.chroma_global = -0.6f; });
  add("chroma by tone", [](P &p) { p.chroma_shadows = 0.6f; p.chroma_midtones = -0.3f; p.chroma_highlights = 0.4f; });
  add("vibrance +0.7", [](P &p) { p.vibrance = 0.7f; });
  add("vibrance -0.5, chroma +0.2", [](P &p) { p.vibrance = -0.5f; p.chroma_global = 0.2f; });
  add("saturation global +0.5, perceptual", [](P &p) { p.saturation_global = 0.5f; });
  add("saturation global -0.5, perceptual", [](P &p) { p.saturation_global = -0.5f; });
  add("saturation by tone, perceptual", [](P &p) { p.saturation_shadows = 0.6f; p.saturation_midtones = -0.4f; p.saturation_highlights = 0.3f; });
  add("brilliance global +0.4, perceptual", [](P &p) { p.brilliance_global = 0.4f; });
  add("brilliance by tone, perceptual", [](P &p) { p.brilliance_shadows = -0.3f; p.brilliance_midtones = 0.2f; p.brilliance_highlights = 0.5f; });
  add("saturation global +0.5, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.saturation_global = 0.5f; });
  add("saturation global -0.6, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.saturation_global = -0.6f; });
  add("saturation by tone, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.saturation_shadows = 0.8f; p.saturation_midtones = 0.3f; p.saturation_highlights = -0.4f; });
  add("brilliance global -0.3, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.brilliance_global = -0.3f; });
  add("brilliance by tone, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.brilliance_shadows = 0.4f; p.brilliance_midtones = -0.2f; p.brilliance_highlights = 0.3f; });
  add("masks: shadows fall-off 3, highlights 0, fulcrum 0.3", [](P &p) {
    p.shadows_weight = 3.f; p.highlights_weight = 0.f; p.mask_grey_fulcrum = 0.3f;
    p.chroma_shadows = 0.5f; p.chroma_highlights = -0.4f; p.saturation_midtones = 0.4f; });
  add("masks: shadows fall-off 0, highlights 2.5, fulcrum 0.05, JzAzBz", [&](P &p) {
    p.saturation_formula = JZ; p.shadows_weight = 0.f; p.highlights_weight = 2.5f; p.mask_grey_fulcrum = 0.05f;
    p.saturation_shadows = 0.5f; p.saturation_highlights = -0.5f; p.brilliance_midtones = 0.3f; });
  add("white fulcrum +2, perceptual", [](P &p) { p.white_fulcrum = 2.f; p.saturation_global = 0.4f; p.brilliance_global = 0.1f; });
  add("white fulcrum -1.5, perceptual", [](P &p) { p.white_fulcrum = -1.5f; p.saturation_global = -0.3f; p.brilliance_shadows = 0.3f; });
  add("white fulcrum +3, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.white_fulcrum = 3.f; p.saturation_global = 0.3f; });
  add("everything, perceptual", [](P &p) {
    p.chroma_global = 0.2f; p.chroma_shadows = 0.3f; p.chroma_midtones = -0.1f; p.chroma_highlights = 0.2f;
    p.vibrance = 0.3f;
    p.saturation_global = 0.25f; p.saturation_shadows = 0.4f; p.saturation_midtones = 0.1f; p.saturation_highlights = -0.3f;
    p.brilliance_global = -0.1f; p.brilliance_shadows = 0.2f; p.brilliance_midtones = 0.05f; p.brilliance_highlights = -0.2f;
    p.shadows_weight = 1.5f; p.highlights_weight = 0.7f; p.mask_grey_fulcrum = 0.15f; p.white_fulcrum = 1.f; });
  add("everything, JzAzBz", [&](P &p) {
    p.saturation_formula = JZ;
    p.chroma_global = 0.2f; p.chroma_shadows = 0.3f; p.chroma_midtones = -0.1f; p.chroma_highlights = 0.2f;
    p.vibrance = 0.3f;
    p.saturation_global = 0.25f; p.saturation_shadows = 0.4f; p.saturation_midtones = 0.1f; p.saturation_highlights = -0.3f;
    p.brilliance_global = -0.1f; p.brilliance_shadows = 0.2f; p.brilliance_midtones = 0.05f; p.brilliance_highlights = -0.2f;
    p.shadows_weight = 1.5f; p.highlights_weight = 0.7f; p.mask_grey_fulcrum = 0.15f; });
  add("extremes +1, perceptual", [](P &p) { p.chroma_global = 1.f; p.saturation_global = 1.f; p.brilliance_global = 1.f; p.vibrance = 1.f; });
  add("extremes -1, perceptual", [](P &p) { p.chroma_global = -1.f; p.saturation_global = -1.f; p.brilliance_global = -1.f; p.vibrance = -1.f; });
  add("extremes +1, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.chroma_global = 1.f; p.saturation_global = 1.f; p.brilliance_global = 1.f; });
  add("extremes -1, JzAzBz", [&](P &p) { p.saturation_formula = JZ; p.saturation_global = -1.f; p.brilliance_global = -1.f; p.vibrance = -1.f; });
  for(const named_params &preset : init_presets()) cases.push_back(preset);
  return cases;
}

// ── JSON ────────────────────────────────────────────────────────────────────

static void print_floats(const float *v, size_t n)
{
  printf("[");
  for(size_t i = 0; i < n; i++) printf("%s%.9g", i ? "," : "", v[i]);
  printf("]");
}

static void print_matrix(const dt_colormatrix_t m)
{
  const float flat[9] = { m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2] };
  print_floats(flat, 9);
}

static void print_params(const dt_iop_colorbalancergb_params_t &p)
{
  printf("{\"saturation_formula\":%d", (int)p.saturation_formula);
#define F(name) printf(",\"" #name "\":%.9g", p.name)
  F(chroma_global); F(chroma_shadows); F(chroma_midtones); F(chroma_highlights);
  F(vibrance);
  F(saturation_global); F(saturation_shadows); F(saturation_midtones); F(saturation_highlights);
  F(brilliance_global); F(brilliance_shadows); F(brilliance_midtones); F(brilliance_highlights);
  F(shadows_weight); F(highlights_weight); F(mask_grey_fulcrum); F(white_fulcrum);
#undef F
  printf("}");
}

int main()
{
  const double rec709[3][2] = { { 0.64, 0.33 }, { 0.30, 0.60 }, { 0.15, 0.06 } };
  const double rec2020[3][2] = { { 0.708, 0.292 }, { 0.170, 0.797 }, { 0.131, 0.046 } };
  mat3d rec709_to_xyz, rec2020_to_xyz, xyz_to_rec2020, rec709_to_rec2020;
  lcms_rgb_to_xyz_d50(rec709, rec709_to_xyz);
  lcms_rgb_to_xyz_d50(rec2020, rec2020_to_xyz);
  inv3d(rec2020_to_xyz, xyz_to_rec2020);
  mul3d(xyz_to_rec2020, rec709_to_xyz, rec709_to_rec2020);

  work_profile_t profile;
  to_colormatrix(rec2020_to_xyz, profile.matrix_in);
  to_colormatrix(xyz_to_rec2020, profile.matrix_out);

  const std::vector<float> pixels = make_pixels(rec709_to_rec2020);
  const size_t n = pixels.size() / 3;
  std::vector<float> in4(4 * n, 0.f), out4(4 * n, 0.f), out3(3 * n);
  for(size_t k = 0; k < n; k++)
    for(int c = 0; c < 3; c++) in4[4 * k + c] = pixels[3 * k + c];

  static dt_iop_colorbalancergb_data_t lut_jz, lut_ucs;
  {
    dt_iop_colorbalancergb_params_t p = default_params();
    p.saturation_formula = DT_COLORBALANCE_SATURATION_JZAZBZ;
    commit_params(&p, &profile, &lut_jz);
    p.saturation_formula = DT_COLORBALANCE_SATURATION_DTUCS;
    commit_params(&p, &profile, &lut_ucs);
  }

  printf("{\"matrixIn\":");
  print_matrix(profile.matrix_in);
  printf(",\"matrixOut\":");
  print_matrix(profile.matrix_out);
  printf(",\"lutJzazbz\":");
  print_floats(lut_jz.gamut_LUT, LUT_ELEM);
  printf(",\"lutUcs\":");
  print_floats(lut_ucs.gamut_LUT, LUT_ELEM);
  printf(",\"pixels\":");
  print_floats(pixels.data(), pixels.size());
  printf(",\"cases\":[");
  const std::vector<named_params> cases = make_cases();
  for(size_t i = 0; i < cases.size(); i++)
  {
    static dt_iop_colorbalancergb_data_t d;
    commit_params(&cases[i].p, &profile, &d);
    process(&d, &profile, in4.data(), out4.data(), n);
    for(size_t k = 0; k < n; k++)
      for(int c = 0; c < 3; c++) out3[3 * k + c] = out4[4 * k + c];
    printf("%s{\"name\":\"%s\",\"params\":", i ? "," : "", cases[i].name);
    print_params(cases[i].p);
    printf(",\"out\":");
    print_floats(out3.data(), out3.size());
    if(d.saturation_formula == DT_COLORBALANCE_SATURATION_JZAZBZ)
    {
      pq_in_double = 1;
      process(&d, &profile, in4.data(), out4.data(), n);
      pq_in_double = 0;
      for(size_t k = 0; k < n; k++)
        for(int c = 0; c < 3; c++) out3[3 * k + c] = out4[4 * k + c];
      printf(",\"outPqDouble\":");
      print_floats(out3.data(), out3.size());
    }
    printf("}");
  }
  printf("]}\n");
  return 0;
}
