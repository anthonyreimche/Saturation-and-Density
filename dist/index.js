//#region src/colour.ts
function e(e, t) {
	return [
		e[0] * t[0] + e[1] * t[1] + e[2] * t[2],
		e[3] * t[0] + e[4] * t[1] + e[5] * t[2],
		e[6] * t[0] + e[7] * t[1] + e[8] * t[2]
	];
}
function t(e, t) {
	let n = [];
	for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) n.push(e[r * 3] * t[i] + e[r * 3 + 1] * t[3 + i] + e[r * 3 + 2] * t[6 + i]);
	return n;
}
function n(e) {
	let [t, n, r, i, a, o, s, c, l] = e, u = t * (a * l - o * c) - n * (i * l - o * s) + r * (i * c - a * s);
	return [
		(a * l - o * c) / u,
		(r * c - n * l) / u,
		(n * o - r * a) / u,
		(o * s - i * l) / u,
		(t * l - r * s) / u,
		(r * i - t * o) / u,
		(i * c - a * s) / u,
		(n * s - t * c) / u,
		(t * a - n * i) / u
	];
}
var r = [
	.8951,
	.2664,
	-.1614,
	-.7502,
	1.7135,
	.0367,
	.0389,
	-.0685,
	1.0296
], i = [
	.9642,
	1,
	.8249
], a = [.312700492, .329000939];
function o(o) {
	let [[s, c], [l, u], [d, f]] = o, p = [
		s / c,
		l / u,
		d / f,
		1,
		1,
		1,
		(1 - s - c) / c,
		(1 - l - u) / u,
		(1 - d - f) / f
	], m = [
		a[0] / a[1],
		1,
		(1 - a[0] - a[1]) / a[1]
	], h = e(n(p), m), ee = p.map((e, t) => e * h[t % 3]), g = e(r, m), _ = e(r, i), v = r.map((e, t) => _[Math.floor(t / 3)] / g[Math.floor(t / 3)] * e);
	return t(t(n(r), v), ee);
}
var s = o([
	[.64, .33],
	[.3, .6],
	[.15, .06]
]), c = o([
	[.708, .292],
	[.17, .797],
	[.131, .046]
]), l = n(c), u = t(l, s), d = n(u), f = [
	.989466254,
	-.0400304626,
	.0440530317,
	-.00540518733,
	1.00666069,
	-.00175551955,
	-.000403920992,
	.015076803,
	1.30210211
], p = [
	1.01085433,
	.0407086103,
	-.0341445825,
	.00542814201,
	.993581926,
	.00115592039,
	.000250722468,
	-.0114918759,
	.767964947
], m = [
	.257085,
	.859943,
	-.031061,
	-.394427,
	1.1758,
	.106423,
	.064856,
	-.07625,
	.559067
], h = [
	1.80794659,
	-1.2997166,
	.34785879,
	.6178396,
	.39595453,
	-.04104687,
	-.1254696,
	.20478038,
	1.74274183
], ee = [
	.95,
	.38,
	0,
	.05,
	.62,
	.03,
	0,
	0,
	.97
], g = [
	1.0877193,
	-.66666667,
	.02061856,
	-.0877193,
	1.66666667,
	-.05154639,
	0,
	0,
	1.03092784
], _ = t(m, t(f, c)), v = t(l, p), y = [.68990272, .34832189], b = [.21902143, .54371398];
function te(t) {
	let n = y[0] * t[0] + y[1] * t[1], r = t[0] + t[1] + t[2], i = e(g, r === 0 ? [
		0,
		0,
		0
	] : [
		t[0] / r,
		t[1] / r,
		t[2] / r
	]);
	return [
		n,
		i[0],
		i[1]
	];
}
function x(e) {
	let t = e[1] - b[0], n = e[2] - b[1], r = Math.sqrt(n * n + t * t);
	return [
		e[0],
		r,
		r === 0 ? 1 : t / r,
		r === 0 ? 0 : n / r
	];
}
function S(t) {
	let n = x(te(e(_, t.map((e) => Math.max(e, 0)))));
	return {
		hue: Math.atan2(n[3], n[2]),
		chroma: n[1]
	};
}
var C = 1.15, w = .66, ne = .8359375, re = 18.8515625, ie = 18.6875, ae = .159301758, T = 134.034375, E = -.56, oe = 16295499532821565e-27, se = [
	.41478972,
	.579999,
	.014648,
	-.20151,
	1.120649,
	.0531008,
	-.0166008,
	.2648,
	.6684799
], ce = [
	.5,
	.5,
	0,
	3.524,
	-4.066708,
	.542708,
	.199076,
	1.096799,
	-1.295875
], le = [
	1,
	.1386050432715393,
	.0580473161561189,
	1,
	-.1386050432715393,
	-.0580473161561189,
	1,
	-.096019242026319,
	-.811891896056039
], ue = [
	1.9242264357876067,
	-1.0047923125953657,
	.037651404030618,
	.3503167620949991,
	.7264811939316552,
	-.065384422948085,
	-.0909828109828475,
	-.3127282905230739,
	1.5227665613052603
], de = [.31271, .32902], fe = 11754943508222875e-54, pe = Math.fround(2.098883786377), me = Math.fround(2.09885), he = .631651345306265, ge = 1.12426773749357, _e = 1.5831518565279648, ve = 15.932993652962535, ye = .6523997524738018, be = .6007557017508491, xe = .8322850678616855, Se = 1.33654221029386, Ce = [
	-.783941002840055,
	.745273540913283,
	.318707282433486
], we = [
	.277512987809202,
	-.205375866083878,
	2.16743692732158
], Te = [
	.153836578598858,
	-.165478376301988,
	.291320554395942
], D = [1.39656225667, 1.4513954287], O = [1.49217352929, 1.52488637914], k = [
	-1.124983854323892,
	-.980483721769325,
	1.86323315098672,
	1.971853092390862
], A = [
	-5.037522385190711,
	-2.504856328185843,
	4.760029407436461,
	2.874012963239247
], Ee = [
	.167171472114775,
	-.150959086409163,
	.940254742367256
], De = [
	.141299802443708,
	-.155185060382272,
	1
], Oe = [
	-.00801531300850582,
	-.00843312433578007,
	-.0256325967652889
], ke = [
	2.66693258,
	2.66821098,
	2.65449762,
	2.65928984,
	2.62195826,
	2.63286042,
	2.61571622,
	2.59795475,
	2.61952448,
	2.64407611,
	2.57262754,
	2.62391806,
	2.60780883,
	2.59304237,
	2.62020659,
	2.62840748,
	2.58009839,
	2.60856891,
	2.61551356,
	2.59442472,
	2.60079932,
	2.60693479,
	2.58100653,
	2.55185771,
	2.51566553,
	2.46650386,
	2.41788864,
	2.43710685,
	2.51429319,
	2.62810302,
	2.65293837,
	2.69035101,
	2.67485023,
	2.61584234,
	2.53796101,
	2.57263398,
	2.60513306,
	2.63455939,
	2.64024854,
	2.67013669,
	2.6712563,
	2.67295647,
	2.69603348,
	2.71783781,
	2.68047595,
	2.68929052,
	2.73840284,
	2.71988106,
	2.71412778,
	2.76965427,
	2.78995752,
	2.73729658,
	2.74970937,
	2.80214953,
	2.85410643,
	2.86938095,
	2.89584804,
	2.92954612,
	2.90968561,
	2.87946463,
	2.9322083,
	2.96032667,
	2.99035692,
	3.03669,
	3.05710745,
	3.03286171,
	3.0259707,
	3.00679231,
	3.02218175,
	3.0662446,
	3.13713121,
	3.25221705,
	3.38108492,
	3.41737938,
	3.41983271,
	3.43712544,
	3.41641951,
	3.40341377,
	3.40856624,
	3.44421196,
	3.47672772,
	3.57206416,
	3.5399406,
	3.62946939,
	3.66208196,
	3.68965912,
	3.70229292,
	3.82045984,
	3.89437628,
	3.9770081,
	4.11995935,
	4.1809926,
	4.2025404,
	4.262568,
	4.31125069,
	4.29886627,
	4.36473942,
	4.48788404,
	4.52760553,
	4.68941116,
	4.80428123,
	4.8777585,
	4.96206808,
	5.09279537,
	5.18928528,
	5.29198933,
	5.43313646,
	5.58869028,
	5.7043848,
	5.8343668,
	6.02699327,
	6.17858934,
	6.34169149,
	6.55066967,
	6.73276043,
	6.90119553,
	7.12383175,
	7.33692646,
	7.58350372,
	7.86800528,
	8.19734001,
	8.57470226,
	8.95547867,
	9.36141777,
	9.78805733,
	10.2021732,
	10.6102352,
	11.0601988,
	11.6002321,
	10.916625,
	10.1622887,
	9.32119751,
	8.35013008,
	7.17875767,
	6.98508978,
	6.93669033,
	6.87589407,
	6.80882025,
	6.53912354,
	6.60654545,
	6.40416861,
	6.20347452,
	6.13776302,
	6.08703375,
	5.8979888,
	5.94618511,
	5.88156033,
	5.63885403,
	5.63313532,
	5.67586756,
	5.44398212,
	5.38321304,
	5.32534647,
	5.15827322,
	5.07613277,
	4.93879604,
	4.80012369,
	4.75077295,
	4.80372858,
	4.56768131,
	4.60577011,
	4.56554699,
	4.4502387,
	4.46786737,
	4.48522377,
	4.34664249,
	4.28379393,
	4.285882,
	4.14205074,
	4.053792,
	4.1422205,
	4.13232327,
	4.07648516,
	4.03813457,
	3.99552965,
	3.90734792,
	3.85604215,
	3.81653023,
	3.71490431,
	3.80989218,
	3.83132982,
	3.76516342,
	3.67792964,
	3.65243292,
	3.50362825,
	3.41294909,
	3.44252634,
	3.46443677,
	3.50622487,
	3.48740315,
	3.4365375,
	3.4037807,
	3.39327765,
	3.39481282,
	3.40039015,
	3.34450293,
	3.30453038,
	3.30553961,
	3.20974588,
	3.13512039,
	3.21527791,
	3.18164992,
	3.15012217,
	3.17504621,
	3.15970755,
	3.11685371,
	3.10765767,
	3.10388041,
	3.06323385,
	3.0738945,
	3.02824807,
	3.00878549,
	2.95252895,
	2.89049482,
	2.97481704,
	3.02496529,
	2.95603991,
	2.93157697,
	2.93898249,
	2.81859255,
	2.75393033,
	2.82352519,
	2.86619949,
	2.89828038,
	2.92609715,
	2.91725564,
	2.93927956,
	2.9289403,
	2.89603424,
	2.90982509,
	2.89233065,
	2.87394762,
	2.86680698,
	2.86490965,
	2.7859149,
	2.85551214,
	2.82310843,
	2.8323493,
	2.8319087,
	2.89853621,
	2.83831859,
	2.86994934,
	2.86559033,
	2.87435198,
	2.83337855,
	2.81377912,
	2.73907423,
	2.80402136,
	2.77287054,
	2.76958799,
	2.7982583,
	2.86755538,
	2.82032299,
	2.8547039,
	2.85288811,
	2.89228916,
	2.88076782,
	2.87998438,
	2.8892529,
	2.89514875,
	2.92497063,
	2.96616077,
	2.94199467,
	2.95494771,
	2.96281862,
	2.93344188,
	2.91519284,
	2.92551112,
	2.97592926,
	2.97519851,
	2.95643306,
	2.97572064,
	3.04105616,
	3.00989342,
	3.03407621,
	3.05316138,
	3.08570409,
	3.05212617,
	3.08416224,
	3.10230398,
	3.13352036,
	3.13058138,
	3.1266942,
	3.12275052,
	3.15096951,
	3.14468002,
	3.13618255,
	3.1606071,
	3.14841509,
	3.29443479,
	3.41356587,
	3.51824045,
	3.61141729,
	3.68125987,
	3.57201624,
	3.46609116,
	3.35304117,
	3.22970629,
	3.10916066,
	3.02543259,
	2.96653199,
	2.9290328,
	2.90742898,
	2.90005326,
	2.87106848,
	2.82118821,
	2.7866292,
	2.73773623,
	2.70730543,
	2.65153766,
	2.6246295,
	2.59284925,
	2.55131006,
	2.50947428,
	2.48613358,
	2.45867515,
	2.43238449,
	2.4169364,
	2.38037539,
	2.34873629,
	2.30644655,
	2.26980472,
	2.22594523,
	2.20552897,
	2.21023726,
	2.19520378,
	2.17619514,
	2.17460012,
	2.15448427,
	2.10721874,
	2.07879591,
	2.05426145,
	2.01254225,
	2.00847602,
	1.99812627,
	1.9972502,
	1.97294807,
	1.9856106,
	1.95264399,
	1.937047,
	1.9258306,
	1.91735482,
	1.92160857,
	1.91431487,
	1.92207205,
	1.91634023,
	1.91208482,
	1.8775984,
	1.86170387,
	1.82273901,
	1.78279245,
	1.76532018,
	1.76063895,
	1.76684344,
	1.7667048,
	1.77672863,
	1.78490186,
	1.77641809,
	1.75813425,
	1.74873126,
	1.75235438,
	1.7342428,
	1.74679923,
	1.7562809,
	1.76463819,
	1.75354517,
	1.74188197,
	1.71608281,
	1.71027017,
	1.69642603,
	1.69071579,
	1.71110654,
	1.71661353,
	1.70613039,
	1.70141578,
	1.70678139,
	1.7022537,
	1.69753587,
	1.69269395,
	1.71171701,
	1.70650411,
	1.6912384,
	1.69696331,
	1.70772266,
	1.69211364,
	1.69753003,
	1.70276546,
	1.69523525,
	1.68837833,
	1.69091761,
	1.68063295,
	1.7159946,
	1.7458334,
	1.75905037,
	1.7546066,
	1.7393055,
	1.69566798,
	1.66700459,
	1.66248417,
	1.68201613,
	1.71779847,
	1.74065518,
	1.76012826,
	1.77750945,
	1.78118551,
	1.79732001,
	1.80208039,
	1.81945229,
	1.81646693,
	1.83236825,
	1.82776415,
	1.85561502,
	1.84636378,
	1.86036146,
	1.87583899,
	1.89287186,
	1.8821888,
	1.88092685,
	1.91679072,
	1.91786504,
	1.9295193,
	1.95417213,
	1.98255515,
	1.99044645,
	2.0084157,
	2.03486705,
	2.03596902,
	2.06019926,
	2.05725813,
	2.06246042,
	2.0568459,
	2.10830903,
	2.15865135,
	2.17860103,
	2.21684051,
	2.25994587,
	2.25649214,
	2.25738907,
	2.28330922,
	2.32668161,
	2.34169078,
	2.38057876,
	2.393013,
	2.41769958,
	2.44615245,
	2.51313615,
	2.5451324,
	2.58194041,
	2.63810778,
	2.64547276,
	2.66618705,
	2.72640347,
	2.78113008,
	2.82451677,
	2.90825319,
	2.94341588,
	2.9908123,
	3.03154922,
	3.08953309,
	3.13182306,
	3.20240784,
	3.24480438,
	3.30822182,
	3.34368777,
	3.36680841,
	3.38125658,
	3.47120738,
	3.63879538,
	3.83461761,
	3.85269237,
	3.87145948,
	3.81043696,
	3.66699266,
	3.49454641,
	3.50117683,
	3.50163698,
	3.46231985,
	3.45622587,
	3.44524813,
	3.39774895,
	3.33000827,
	3.35165906,
	3.30029106,
	3.2316525,
	3.24952888,
	3.21887827,
	3.14903688,
	3.13483763,
	3.12029147,
	3.04158306,
	3.09191012,
	3.05499315,
	2.99702883,
	2.97097015,
	2.97173452,
	2.87185621,
	2.90192294,
	2.89206243,
	2.89403296,
	2.86934519,
	2.87525606,
	2.80851102,
	2.76369214,
	2.79780912,
	2.72320819,
	2.68788099,
	2.67981243,
	2.70701456,
	2.60769701,
	2.66674566,
	2.65359664,
	2.64962316
], Ae = [
	.000471170439,
	.000467502541,
	.000462795113,
	.000458281633,
	.000453984132,
	.000449893239,
	.000446001213,
	.000442275865,
	.000438712857,
	.000435331895,
	.000432126806,
	.000429092033,
	.000426202314,
	.000423474819,
	.000420905446,
	.000418472249,
	.0004161908,
	.000414057547,
	.000412068912,
	.000410222099,
	.000408501277,
	.000406917534,
	.000405469473,
	.000404143531,
	.000402949372,
	.000401885161,
	.000400941062,
	.000400117482,
	.000399421056,
	.000398850068,
	.000398402277,
	.0003980732,
	.000397863943,
	.000397776224,
	.000397809024,
	.000397961325,
	.000398235279,
	.000398631062,
	.000399145531,
	.000399783225,
	.000400545803,
	.000401435187,
	.000402441365,
	.000403575192,
	.000404838065,
	.000406232139,
	.000407758984,
	.000409400905,
	.000411198358,
	.000413133763,
	.000415185146,
	.000417403004,
	.000419765303,
	.000422275043,
	.000424933241,
	.000427743129,
	.000430705841,
	.000433823967,
	.000437142939,
	.000440625969,
	.000444276258,
	.000448094477,
	.000452083972,
	.000456304755,
	.000460706127,
	.000465291349,
	.000470130763,
	.000475164066,
	.000480394665,
	.000485904457,
	.000491708517,
	.000497731322,
	.000503977295,
	.000510546903,
	.000517352077,
	.00052450737,
	.000532027741,
	.000539815403,
	.000547870703,
	.000556332991,
	.000565219845,
	.000574411359,
	.000584063877,
	.000594039855,
	.000604516361,
	.000615516328,
	.000626886031,
	.000638825586,
	.0006513673,
	.000664547202,
	.000678402896,
	.000692731759,
	.00070754491,
	.000723379781,
	.000740037533,
	.000757281727,
	.000775429187,
	.000794537133,
	.000814667321,
	.000835520565,
	.000857501291,
	.000881077896,
	.000905544381,
	.000931382878,
	.000958670978,
	.000987528008,
	.0010180478,
	.00104980194,
	.00108401687,
	.00112028793,
	.00115879613,
	.00119968876,
	.00124241714,
	.00128866162,
	.00133791182,
	.00139045529,
	.00144653511,
	.00150543975,
	.00156954105,
	.00163942063,
	.00171317696,
	.00179245742,
	.00187924737,
	.00197289814,
	.00207411917,
	.00218371325,
	.00230259006,
	.00243178755,
	.00257248688,
	.00272876048,
	.00289988285,
	.00308792316,
	.00329851662,
	.00353147788,
	.00378999161,
	.00407782011,
	.00440504076,
	.00477257045,
	.00509314379,
	.00502197212,
	.00490288576,
	.00478862785,
	.00467900373,
	.00457561482,
	.00447639963,
	.00438119145,
	.00428988552,
	.00420232955,
	.00411969936,
	.00404043915,
	.00396441203,
	.00389153045,
	.00382166333,
	.00375568843,
	.00369151961,
	.00363003719,
	.00357200252,
	.00351562444,
	.00346166175,
	.00341004133,
	.00336001418,
	.00331221125,
	.00326655991,
	.00322295376,
	.00318132574,
	.00314109097,
	.00309924223,
	.00304955733,
	.00299177854,
	.00292730238,
	.0028569249,
	.00278143585,
	.00270271092,
	.00262546958,
	.00255213375,
	.00248254277,
	.00241648965,
	.00235375366,
	.0022947567,
	.00223864336,
	.00218470511,
	.00213389611,
	.00208552275,
	.00203897827,
	.00199507829,
	.0019532328,
	.00191294798,
	.00187454163,
	.00183825742,
	.00180331036,
	.0017699583,
	.00173813489,
	.00170774816,
	.00167874095,
	.00165078917,
	.00162410527,
	.00159862463,
	.00157428987,
	.00155085034,
	.00152846868,
	.00150709774,
	.00148668711,
	.00146719569,
	.00144842931,
	.0014303755,
	.00141315011,
	.00139671646,
	.00138103962,
	.0013660884,
	.00135172345,
	.0013380358,
	.00132499798,
	.00131249323,
	.00130059652,
	.00128928584,
	.00127846294,
	.00126819161,
	.00125845347,
	.00124922849,
	.00124050165,
	.00123225537,
	.00122447708,
	.00121710449,
	.00121017965,
	.00120373257,
	.00119770726,
	.0011920929,
	.00118688238,
	.00118206744,
	.00117767102,
	.00117365445,
	.00117001415,
	.00116674695,
	.00116386754,
	.00116136903,
	.00115923036,
	.00115746283,
	.00115605397,
	.00115501159,
	.00115433708,
	.00115401926,
	.00115406327,
	.00115446479,
	.00115523161,
	.00115636305,
	.00115785422,
	.00115971384,
	.00116193318,
	.00116452924,
	.00116751017,
	.00117086223,
	.00117458741,
	.00117869,
	.00118320482,
	.00118811196,
	.00119341805,
	.00119913067,
	.00120525819,
	.00121185649,
	.00121889589,
	.00122633623,
	.00123423617,
	.00124260876,
	.0012514703,
	.00126083591,
	.00127072376,
	.00128115178,
	.00129205908,
	.00130354008,
	.00131561561,
	.00132821384,
	.00134144584,
	.00135533884,
	.00136992172,
	.00138509995,
	.0014010201,
	.00141770847,
	.00143506273,
	.00145324471,
	.00147229573,
	.00146850024,
	.00136043679,
	.00124887901,
	.00115528482,
	.0010749239,
	.00100516865,
	.000943992287,
	.000889419869,
	.000840585679,
	.000796463399,
	.00075649214,
	.000720496697,
	.000687494234,
	.00065718207,
	.000629537157,
	.000603849068,
	.00057994487,
	.000558081898,
	.000537689193,
	.000518644811,
	.000500850438,
	.000484205812,
	.000468631013,
	.000453891989,
	.000440084143,
	.000427141582,
	.000415003829,
	.000403616054,
	.000392805086,
	.00038253711,
	.000372784067,
	.000363516097,
	.000354813412,
	.000346539222,
	.000338669808,
	.000331279152,
	.000324156834,
	.000317379832,
	.000311017619,
	.000304881221,
	.00029904244,
	.000293487567,
	.000288202456,
	.000283174682,
	.000278323976,
	.000273711077,
	.000269325654,
	.000265095878,
	.000261076464,
	.000257258682,
	.00025357792,
	.000250083889,
	.000246769137,
	.000243575763,
	.000240501569,
	.000237589396,
	.000234832667,
	.000232182094,
	.000229635756,
	.000227230383,
	.000224923395,
	.000222712275,
	.000220630347,
	.00021863867,
	.000216767032,
	.000214981294,
	.000213278749,
	.000211660066,
	.000210122482,
	.000208690341,
	.000207335834,
	.000206078985,
	.000204895638,
	.000203765958,
	.000202727955,
	.00020176114,
	.00020086467,
	.000200052091,
	.00019929382,
	.000198604117,
	.000197993009,
	.000197447676,
	.000196959329,
	.000196537629,
	.000196188208,
	.000195902932,
	.000195681103,
	.000195522531,
	.000195425819,
	.000195393994,
	.000195425775,
	.000195520115,
	.000195680128,
	.000195903907,
	.00019619221,
	.000196544177,
	.00019696042,
	.000197440066,
	.00019798406,
	.000198602691,
	.000199287606,
	.000200038761,
	.000200855851,
	.000201755698,
	.000202723691,
	.000203761141,
	.000204867349,
	.000206043012,
	.000207310033,
	.000208672529,
	.000210109618,
	.000211622624,
	.000213237727,
	.000214931875,
	.000216705375,
	.000218558664,
	.000220524569,
	.000222607079,
	.000224777032,
	.000227070646,
	.00022949354,
	.000232011414,
	.000234625972,
	.000237379558,
	.000240278372,
	.000243282993,
	.000246441778,
	.000249760633,
	.000253246399,
	.000256905536,
	.00026069241,
	.000264608592,
	.000268771546,
	.000273134588,
	.000277645915,
	.000282434834,
	.000287451112,
	.000292637356,
	.000298067665,
	.000303824374,
	.000309851544,
	.000316139922,
	.00032249192,
	.000328786817,
	.000335080287,
	.000341280364,
	.000347369787,
	.000353330281,
	.000359222002,
	.000365291926,
	.000371599861,
	.00037822497,
	.000385036605,
	.000392116141,
	.000399549201,
	.000407275889,
	.000415307557,
	.000423658348,
	.00043234133,
	.000441372249,
	.000450858119,
	.000460729003,
	.000471004692,
	.000481703115,
	.000492846884,
	.000504564145,
	.000516778615,
	.000529517827,
	.000542808615,
	.000556682004,
	.000571169774,
	.000586307724,
	.000602270302,
	.000618828286,
	.000636161945,
	.00065446808,
	.000673500588,
	.000693464477,
	.000714418944,
	.000736433954,
	.000759579241,
	.000783741707,
	.000808981888,
	.000835581799,
	.00086364086,
	.000893035962,
	.000923858199,
	.000956202741,
	.000990450266,
	.00102646532,
	.00105577463,
	.00103229994,
	.00100107526,
	.000971654314,
	.000943715684,
	.000917161815,
	.000892058422,
	.000868152827,
	.000845501956,
	.000824022456,
	.000803499017,
	.000783996948,
	.000765441917,
	.000747771701,
	.000730924599,
	.000714848924,
	.00069949287,
	.000684812374,
	.000670764188,
	.00065738766,
	.000644636399,
	.000632399693,
	.000620713225,
	.000609544222,
	.000598797167,
	.000588567927,
	.00057876663,
	.000569367257,
	.000560347922,
	.00055168767,
	.000543415255,
	.000535507104,
	.000527943193,
	.00052066159,
	.000513690175,
	.000507012941,
	.000500614929,
	.00049448316,
	.000488604244,
	.000482967735,
	.000477595459,
	.000473716849
], j = Object.freeze({
	jzazbz: 0,
	perceptual: 1
}), M = Object.freeze({
	shadowsWeight: [0, 3],
	highlightsWeight: [0, 3],
	maskGreyFulcrum: [0, 1],
	whiteFulcrum: [-16, 16]
}), je = [
	"red",
	"yellow",
	"green",
	"cyan",
	"blue",
	"magenta",
	"skin"
], N = je.length, Me = Object.freeze({
	global: 0,
	shadows: 0,
	midtones: 0,
	highlights: 0
}), Ne = Object.freeze({
	hue: 0,
	chroma: 0,
	saturation: 0,
	brilliance: 0
}), P = Object.freeze({
	formula: j.perceptual,
	chroma: Me,
	vibrance: 0,
	saturation: Me,
	brilliance: Me,
	masks: Object.freeze({
		shadowsWeight: 1,
		highlightsWeight: 1,
		maskGreyFulcrum: .1845,
		whiteFulcrum: 0
	}),
	slices: Object.freeze(Array.from({ length: N }, () => Ne))
}), Pe = (e) => e.global === 0 && e.shadows === 0 && e.midtones === 0 && e.highlights === 0;
function Fe(e) {
	return Pe(e.chroma) && Pe(e.saturation) && Pe(e.brilliance) && e.vibrance === 0 && e.slices.every((e) => e.hue === 0 && e.chroma === 0 && e.saturation === 0 && e.brilliance === 0);
}
var Ie = .4101205819200422, Le = 1e-6, Re = [
	[
		1,
		0,
		0
	],
	[
		1,
		1,
		0
	],
	[
		0,
		1,
		0
	],
	[
		0,
		1,
		1
	],
	[
		0,
		0,
		1
	],
	[
		1,
		0,
		1
	]
], ze = [
	.693872,
	.351533,
	.223228
], Be = (t) => S(e(u, t)), Ve = [...Re, ze].map((e) => Be(e).hue), He = [
	"#e0403a",
	"#e0c83a",
	"#4cc048",
	"#46c4d0",
	"#4a62e0",
	"#c84ad0",
	"#d9a082"
], F = 2 * Math.PI, Ue = (e) => e - F * Math.floor((e + Math.PI) / F), We = Ve.slice(0, 6).map((e, t, n) => {
	let r = n.filter((e, n) => n !== t).map((t) => Ue(t - e)), i = Math.min(...r.map((e) => e > 0 ? e : e + F));
	return [Math.min(...r.map((e) => e < 0 ? -e : F - e)), i];
}), Ge = [.004, .025], Ke = 30 * Math.PI / 180, qe = Be(ze).chroma, I = [
	.2,
	.5,
	1.8,
	3
].map((e) => e * qe), Je = 1e-30, Ye = "saturation-density", L = `${Ye}.scene`, Xe = [
	"sdFormula",
	"sdActive",
	"sdChroma",
	"sdSaturation",
	"sdBrilliance",
	"sdMasks",
	"sdVibrance",
	"sdSlices"
], R = (e) => `${L}.${e}`, z = (e) => [
	e.global,
	e.shadows,
	e.midtones,
	e.highlights
], Ze = (e) => [
	e.shadowsWeight,
	e.highlightsWeight,
	e.maskGreyFulcrum,
	e.whiteFulcrum
], Qe = (e) => e.flatMap((e) => [
	e.hue,
	e.chroma,
	e.saturation,
	e.brilliance
]), B = [-1, 1], $e = [-1, 1], V = Array.from({ length: 4 }, () => B), et = [
	M.shadowsWeight,
	M.highlightsWeight,
	M.maskGreyFulcrum,
	M.whiteFulcrum
], tt = Array.from({ length: N }, () => [
	[-180, 180],
	B,
	B,
	B
]).flat(), H = (e, [t, n]) => Math.min(n, Math.max(t, e)), U = (e, t) => e.map((e, n) => H(e, t[n]));
function nt(e) {
	return {
		[R("sdFormula")]: e.formula,
		[R("sdActive")]: +!Fe(e),
		[R("sdChroma")]: U(z(e.chroma), V),
		[R("sdSaturation")]: U(z(e.saturation), V),
		[R("sdBrilliance")]: U(z(e.brilliance), V),
		[R("sdMasks")]: U(Ze(e.masks), et),
		[R("sdVibrance")]: H(e.vibrance, $e),
		[R("sdSlices")]: U(Qe(e.slices), tt)
	};
}
var rt = (e) => typeof e == "number" && Number.isFinite(e);
function it(e, t, n, r) {
	let i = e[R(t)];
	return !Array.isArray(i) || i.length !== n.length ? null : i.map((e, t) => rt(e) ? H(e, n[t]) : r[t]);
}
function at(e, t, n) {
	let r = it(e, t, V, z(n));
	return r ? {
		global: r[0],
		shadows: r[1],
		midtones: r[2],
		highlights: r[3]
	} : { ...n };
}
function ot(e) {
	return Object.values(j).find((t) => t === e) ?? P.formula;
}
function st(e) {
	let t = it(e, "sdMasks", et, Ze(P.masks)), n = it(e, "sdSlices", tt, Qe(P.slices)), r = e[R("sdVibrance")];
	return {
		formula: ot(e[R("sdFormula")]),
		chroma: at(e, "sdChroma", P.chroma),
		vibrance: rt(r) ? H(r, $e) : P.vibrance,
		saturation: at(e, "sdSaturation", P.saturation),
		brilliance: at(e, "sdBrilliance", P.brilliance),
		masks: t ? {
			shadowsWeight: t[0],
			highlightsWeight: t[1],
			maskGreyFulcrum: t[2],
			whiteFulcrum: t[3]
		} : { ...P.masks },
		slices: n ? Array.from({ length: N }, (e, t) => {
			let r = 4 * t;
			return {
				hue: n[r],
				chroma: n[r + 1],
				saturation: n[r + 2],
				brilliance: n[r + 3]
			};
		}) : P.slices.map((e) => ({ ...e }))
	};
}
var ct = () => nt(P), W = (e) => ({
	global: 0,
	shadows: 0,
	midtones: 0,
	highlights: 0,
	...e
}), lt = [
	{
		id: "legacy",
		label: "Basic colourfulness: legacy",
		params: {
			...P,
			formula: j.jzazbz,
			chroma: W({ global: .2 }),
			saturation: W({
				shadows: .1,
				midtones: .05,
				highlights: -.05
			})
		}
	},
	{
		id: "natural-skin",
		label: "Basic colourfulness: natural skin",
		params: {
			...P,
			saturation: W({
				global: .2,
				shadows: .3,
				highlights: -.5
			})
		}
	},
	{
		id: "vibrant",
		label: "Basic colourfulness: vibrant colours",
		params: {
			...P,
			saturation: W({
				global: .2,
				shadows: .5,
				highlights: -.25
			})
		}
	},
	{
		id: "standard",
		label: "Basic colourfulness: standard",
		params: {
			...P,
			saturation: W({
				global: .2,
				shadows: .25,
				highlights: -.25
			})
		}
	}
], G, K;
function ut(e) {
	K = e, G = e.react;
}
//#endregion
//#region src/store.ts
var dt = null;
function ft() {
	dt = K.stores.create((e) => ({
		tab: "global",
		slice: 0,
		setTab: (t) => e({ tab: t }),
		setSlice: (t) => e({ slice: t })
	}));
}
function pt() {
	if (!dt) throw Error("[saturation-density] store() called before activate()");
	return dt;
}
//#endregion
//#region src/Panel.tsx
var mt = [
	{
		value: "global",
		label: "Global"
	},
	{
		value: "tones",
		label: "Tones"
	},
	{
		value: "slices",
		label: "Slices"
	},
	{
		value: "masks",
		label: "Masks"
	}
], ht = [{
	value: String(j.perceptual),
	label: "Perceptual"
}, {
	value: String(j.jzazbz),
	label: "JzAzBz"
}], gt = "Perceptual is gentle. JzAzBz is stronger and more subtractive, but heavy saturation can crush saturated blues toward black.", q = {
	chroma: "Adds or removes colour at constant luminance (additive).",
	saturation: "Subtractive saturation: colours get denser and darker as they saturate. Strongest with the JzAzBz formula, gentler with Perceptual.",
	brilliance: "Brightens or darkens colours relative to greys.",
	vibrance: "Boosts low-chroma colours more than colours that are already colourful."
}, _t = [
	{
		key: "chroma",
		title: "Chroma"
	},
	{
		key: "saturation",
		title: "Saturation"
	},
	{
		key: "brilliance",
		title: "Brilliance"
	}
], vt = [
	{
		key: "shadows",
		label: "Shadows"
	},
	{
		key: "midtones",
		label: "Midtones"
	},
	{
		key: "highlights",
		label: "Highlights"
	}
], J = {
	min: -100,
	max: 100,
	step: 1,
	defaultValue: 0
}, Y = (e) => Math.round(e * 1e6) / 1e4, yt = (e) => e[0].toUpperCase() + e.slice(1), bt = (e) => e.hue === 0 && e.chroma === 0 && e.saturation === 0 && e.brilliance === 0, xt = (e, t, n, r) => ({
	...e,
	[t]: {
		...e[t],
		[n]: r / 100
	}
});
function St() {
	let { Slider: e } = K.components, { Button: t, Field: n, Row: r, SegmentedControl: i, Section: a, Select: o, Stack: s } = K.ui, c = K.develop.useParamScope(), l = pt()((e) => e.tab), u = pt()((e) => e.slice), d = st(c.getParams()), f = () => st(c.getParams()), p = (e) => c.setParams(nt(e)), m = (e) => c.commit(`Saturation & Density: ${e}`), h = (t, n, r, i, a, o, s = !1) => /* @__PURE__ */ G.createElement("div", {
		key: `${t}-${a}`,
		title: o,
		"aria-disabled": s ? !0 : void 0,
		style: s ? {
			opacity: .4,
			pointerEvents: "none"
		} : void 0
	}, /* @__PURE__ */ G.createElement(e, {
		label: t,
		value: n,
		...r,
		onChange: (e) => p(i(e, f())),
		onCommit: () => m(a)
	})), ee = /* @__PURE__ */ G.createElement(G.Fragment, null, h("Chroma", Y(d.chroma.global), J, (e, t) => xt(t, "chroma", "global", e), "chroma", q.chroma), h("Vibrance", Y(d.vibrance), J, (e, t) => ({
		...t,
		vibrance: e / 100
	}), "vibrance", q.vibrance), h("Saturation", Y(d.saturation.global), J, (e, t) => xt(t, "saturation", "global", e), "saturation", q.saturation), h("Brilliance", Y(d.brilliance.global), J, (e, t) => xt(t, "brilliance", "global", e), "brilliance", q.brilliance)), g = /* @__PURE__ */ G.createElement(G.Fragment, null, _t.map((e) => /* @__PURE__ */ G.createElement(a, {
		key: e.key,
		title: e.title
	}, /* @__PURE__ */ G.createElement(s, { gap: 4 }, vt.map((t) => h(t.label, Y(d[e.key][t.key]), J, (n, r) => xt(r, e.key, t.key, n), `${e.key} ${t.key}`, q[e.key])))))), _ = (e, t) => ({
		...e,
		slices: e.slices.map((e, n) => n === u ? {
			...e,
			...t
		} : e)
	}), v = d.slices[u], y = je[u], b = /* @__PURE__ */ G.createElement(G.Fragment, null, /* @__PURE__ */ G.createElement(r, {
		gap: 4,
		wrap: !0
	}, je.map((e, n) => {
		let i = !bt(d.slices[n]);
		return /* @__PURE__ */ G.createElement(t, {
			key: e,
			size: "sm",
			active: n === u,
			"aria-pressed": n === u,
			"aria-label": `${yt(e)}${i ? " (edited)" : ""}`,
			title: yt(e),
			onClick: () => pt().getState().setSlice(n)
		}, /* @__PURE__ */ G.createElement(r, {
			gap: 4,
			align: "center"
		}, /* @__PURE__ */ G.createElement("span", { style: {
			width: 12,
			height: 12,
			borderRadius: 6,
			background: He[n],
			display: "inline-block"
		} }), i ? /* @__PURE__ */ G.createElement("span", { style: {
			width: 4,
			height: 4,
			borderRadius: 2,
			background: "currentColor",
			display: "inline-block"
		} }) : null));
	})), h("Hue", Math.round(v.hue), {
		min: -180,
		max: 180,
		step: 1,
		defaultValue: 0
	}, (e, t) => _(t, { hue: e }), `${y} hue`, "Turns this colour toward its neighbour, in degrees."), h("Chroma", Y(v.chroma), J, (e, t) => _(t, { chroma: e / 100 }), `${y} chroma`, q.chroma), h("Saturation", Y(v.saturation), J, (e, t) => _(t, { saturation: e / 100 }), `${y} saturation`, q.saturation), h("Brilliance", Y(v.brilliance), J, (e, t) => _(t, { brilliance: e / 100 }), `${y} brilliance`, q.brilliance)), te = P.masks, x = (e, t) => ({
		...e,
		masks: {
			...e.masks,
			...t
		}
	}), S = (e) => ({
		min: M[e][0] * 100,
		max: M[e][1] * 100,
		step: e === "maskGreyFulcrum" ? .05 : 1,
		defaultValue: Y(te[e])
	}), C = /* @__PURE__ */ G.createElement(G.Fragment, null, /* @__PURE__ */ G.createElement(n, { label: "Saturation formula" }, /* @__PURE__ */ G.createElement(o, {
		ariaLabel: "Saturation formula",
		title: gt,
		value: String(d.formula),
		options: ht,
		onChange: (e) => {
			p({
				...f(),
				formula: Number(e)
			}), m("formula");
		}
	})), h("Shadows fall-off", Y(d.masks.shadowsWeight), S("shadowsWeight"), (e, t) => x(t, { shadowsWeight: e / 100 }), "shadows fall-off", "How softly the shadows mask fades into the midtones."), h("Highlights fall-off", Y(d.masks.highlightsWeight), S("highlightsWeight"), (e, t) => x(t, { highlightsWeight: e / 100 }), "highlights fall-off", "How softly the highlights mask fades into the midtones."), h("Mask grey fulcrum", Y(d.masks.maskGreyFulcrum), S("maskGreyFulcrum"), (e, t) => x(t, { maskGreyFulcrum: e / 100 }), "mask grey fulcrum", "The grey level, as a percentage, that divides shadows from highlights in the masks."), h("White fulcrum", Math.round(d.masks.whiteFulcrum * 10) / 10, {
		min: M.whiteFulcrum[0],
		max: M.whiteFulcrum[1],
		step: .1,
		defaultValue: te.whiteFulcrum
	}, (e, t) => x(t, { whiteFulcrum: e }), "white fulcrum", "The white level, in EV, that the Perceptual formula measures brightness against. Not used by JzAzBz.", d.formula === j.jzazbz));
	return /* @__PURE__ */ G.createElement(s, {
		gap: 6,
		style: { padding: 8 }
	}, /* @__PURE__ */ G.createElement(o, {
		ariaLabel: "Saturation & Density preset",
		value: "",
		placeholder: "Presets",
		options: lt.map((e) => ({
			value: e.id,
			label: e.label
		})),
		onChange: (e) => {
			let t = lt.find((t) => t.id === e);
			t && (p(t.params), m(`preset: ${t.label}`));
		}
	}), /* @__PURE__ */ G.createElement(i, {
		size: "sm",
		value: l,
		options: mt,
		onChange: (e) => pt().getState().setTab(e)
	}), l === "global" ? ee : null, l === "tones" ? g : null, l === "slices" ? b : null, l === "masks" ? C : null);
}
//#endregion
//#region src/stage.ts
function Ct(e) {
	let t = e.toPrecision(10);
	if (!t.includes("e")) return t.includes(".") ? t : `${t}.0`;
	let [n, r] = t.split("e");
	return `${n.includes(".") ? n : `${n}.0`}e${r}`;
}
var X = (e) => `vec3(${e.map(Ct).join(", ")})`;
function Z(e) {
	return `mat3(${[
		0,
		3,
		6,
		1,
		4,
		7,
		2,
		5,
		8
	].map((t) => Ct(e[t])).join(", ")})`;
}
var Q = Ct, wt = "sdLut", Tt = (e) => 2 ** (13 - Math.floor(Math.log2(Math.max(...e)))), $ = Object.freeze({
	jzazbz: Tt(ke),
	ucs: Tt(Ae)
});
function Et(e) {
	if (e === 0 || !Number.isFinite(e)) return e;
	let t = 2 ** (Math.max(Math.floor(Math.log2(Math.abs(e))), -14) - 10);
	return Math.round(e / t) * t;
}
function Dt(e) {
	let t = Et(e);
	return [t, e - t];
}
function Ot() {
	let e = /* @__PURE__ */ new Float32Array(2048);
	for (let t = 0; t < 512; t++) {
		let [n, r] = Dt(ke[t] * $.jzazbz), [i, a] = Dt(Ae[t] * $.ucs);
		e.set([
			n,
			r,
			i,
			a
		], 4 * t);
	}
	return {
		data: e,
		width: 512,
		height: 1,
		format: "rgba16f",
		version: 1
	};
}
var kt = re / ne - ie, At = ne ** +T, jt = Q(Math.PI), Mt = Q(2 * Math.PI), Nt = `
vec3 sdYrgFromLms(vec3 lms) {
  float sdy = ${Q(y[0])} * lms.x + ${Q(y[1])} * lms.y;
  float a = lms.x + lms.y + lms.z;
  vec3 n = a == 0.0 ? vec3(0.0) : lms / a;
  vec3 rgb = ${Z(g)} * n;
  return vec3(sdy, rgb.x, rgb.y);
}
vec3 sdLmsFromYrg(vec3 yrg) {
  vec3 lms = ${Z(ee)} * vec3(yrg.y, yrg.z, 1.0 - yrg.y - yrg.z);
  float denom = ${Q(y[0])} * lms.x + ${Q(y[1])} * lms.y;
  return lms * (denom == 0.0 ? 0.0 : yrg.x / denom);
}

// opacity_masks: shadows, midtones, highlights at pow(Y, ${Ie}),
// from the raw masks params (fall-offs, fulcrum). The exponents are clamped
// where exp would overflow; the opacity there is 0 or 1 either way.
vec3 sdOpacities(float x, vec4 masks) {
  float sw = 2.0 + 2.0 * masks.x;
  float hw = 2.0 + 2.0 * masks.y;
  float mw = sw * sw * hw * hw / (sw * sw + hw * hw);
  float fulcrum = pow(max(masks.z, ${Q(Le)}), ${Q(Ie)});
  float offset = x - fulcrum;
  float norm = offset / fulcrum;
  float alpha = 1.0 / (1.0 + exp(clamp(norm * sw, -80.0, 80.0)));
  float beta = 1.0 / (1.0 + exp(clamp(-norm * hw, -80.0, 80.0)));
  float gamma = exp(-offset * offset * mw / 4.0) * (1.0 - alpha) * (1.0 - alpha) * (1.0 - beta) * (1.0 - beta) * 8.0;
  return vec3(alpha, gamma, beta);
}

// cos and sin of an angle in [-pi, pi], from Taylor series at half the
// angle (to 1e-9): GPU sin and cos can be far coarser (SwiftShader's are
// 2e-4 off). Where darktable takes sin and cos of an atan2 the shader takes
// the ratios atan2 came from instead.
vec2 sdCosSin(float a) {
  float x = 0.5 * a;
  float x2 = x * x;
  float s = x * (1.0 - x2 / 6.0 * (1.0 - x2 / 20.0 * (1.0 - x2 / 42.0 * (1.0 - x2 / 72.0 * (1.0 - x2 / 110.0 * (1.0 - x2 / 156.0))))));
  float c = 1.0 - x2 / 2.0 * (1.0 - x2 / 12.0 * (1.0 - x2 / 30.0 * (1.0 - x2 / 56.0 * (1.0 - x2 / 90.0 * (1.0 - x2 / 132.0 * (1.0 - x2 / 182.0))))));
  return vec2(c * c - s * s, 2.0 * s * c);
}
float sdWrap(float a) {
  return a - ${Mt} * floor((a + ${jt}) / ${Mt});
}
float sdBump(float t) {
  return t < 1.0 ? 0.5 + 0.5 * sdCosSin(${jt} * t).x : 0.0;
}
float sdVector(float hue, float centre, float below, float above) {
  float delta = sdWrap(hue - centre);
  return sdBump(delta >= 0.0 ? delta / above : -delta / below);
}

// The slices' weights at the input Yrg hue and chroma (model.ts sliceWeights):
// red, yellow, green in \`lo\`, cyan, blue, magenta in \`hi\`, skin returned.
float sdSliceWeights(float hue, float chroma, out vec3 lo, out vec3 hi) {
  float skin = sdBump(abs(sdWrap(hue - ${Q(Ve[6])})) / ${Q(Ke)})
    * smoothstep(${Q(I[0])}, ${Q(I[1])}, chroma)
    * (1.0 - smoothstep(${Q(I[2])}, ${Q(I[3])}, chroma));
  float keep = smoothstep(${Q(Ge[0])}, ${Q(Ge[1])}, chroma) * (1.0 - skin);
${Array.from({ length: 6 }, (e, t) => `  ${t < 3 ? `lo.${"xyz"[t]}` : `hi.${"xyz"[t - 3]}`} = sdVector(hue, ${Q(Ve[t])}, ${Q(We[t][0])}, ${Q(We[t][1])}) * keep;`).join("\n")}
  return skin;
}

// gamut_check_Yrg: the chroma clipped so rg stays inside Yrg's triangle.
float sdGamutCheckYrg(float c, vec2 hue) {
  vec2 rg = c * hue + vec2(${Q(b[0])}, ${Q(b[1])});
  float m = c;
  if (rg.x < 0.0) m = min(${Q(-b[0])} / hue.x, m);
  if (rg.y < 0.0) m = min(${Q(-b[1])} / hue.y, m);
  if (rg.x + rg.y > 1.0) m = min(${Q(1 - b[0] - b[1])} / (hue.x + hue.y), m);
  return m;
}

float sdSoftClip(float x, float soft, float hard) {
  float norm = hard - soft;
  if (!(norm > 0.0)) return min(x, soft);
  return x > soft ? soft + (1.0 - exp(-(x - soft) / norm)) * norm : x;
}

float sdAtan2(float y, float x) {
  return x == 0.0 && y == 0.0 ? 0.0 : atan(y, x);
}

// lookup_gamut: the two texels round a hue and the weight between them.
vec3 sdLutCoord(float hue) {
  float x = ${Q(512)} * (hue + ${jt}) / ${Mt};
  float below = floor(x);
  int a = int(below) & 511;
  int b = int(ceil(x)) & 511;
  return vec3(float(a), float(b), x - below);
}
float sdLutValue(vec2 a, vec2 b, vec3 q, float unscale) {
  float ya = (a.x + a.y) * unscale;
  float yb = (b.x + b.y) * unscale;
  return ya + (q.x != q.y ? q.z * (yb - ya) : 0.0);
}

// JzAzBz's PQ curve both ways through u = (base / c1) - 1, which float
// holds to its last bit where the base itself would lose 134 of them.
float sdLog1p(float u) {
  float s = u / (2.0 + u);
  float s2 = s * s;
  return 2.0 * s * (1.0 + s2 * (${Q(1 / 3)} + s2 * (0.2 + s2 * ${Q(1 / 7)})));
}
float sdExpm1(float z) {
  return z * (1.0 + z / 2.0 * (1.0 + z / 3.0 * (1.0 + z / 4.0 * (1.0 + z / 5.0 * (1.0 + z / 6.0 * (1.0 + z / 7.0))))));
}
// log2 of a positive normal float as its exponent and the mantissa's log2,
// apart: the mantissa from the float's bits, reduced to [sqrt(1/2), sqrt(2)),
// its log from an atanh series. GPU log2, exp2 and pow are a few ulps off
// (SwiftShader's 5e-7), which the PQ curve's 134th power and the steep
// inverse near its top multiply past 1e-4. The bits need highp: the
// program's ints are mediump, 16 bits on a driver that honours it.
vec2 sdLog2Split(float v) {
  highp int bits = floatBitsToInt(v);
  float e = float(((bits >> 23) & 255) - 127);
  float m = intBitsToFloat((bits & 8388607) | 1065353216);
  if (m > ${Q(Math.SQRT2)}) {
    m *= 0.5;
    e += 1.0;
  }
  float s = (m - 1.0) / (m + 1.0);
  float s2 = s * s;
  float ln = 2.0 * s * (1.0 + s2 * (${Q(1 / 3)} + s2 * (0.2 + s2 * (${Q(1 / 7)} + s2 * (${Q(1 / 9)} + s2 * ${Q(1 / 11)})))));
  return vec2(e, ln * ${Q(Math.LOG2E)});
}
// 2^a from its whole part, exactly, and a Taylor series on the rest.
float sdExp2(float a) {
  if (a < -126.0) return 0.0;
  float i = floor(min(a, 127.0) + 0.5);
  float y = (a - i) * ${Q(Math.LN2)};
  float p = 1.0 + y * (1.0 + y / 2.0 * (1.0 + y / 3.0 * (1.0 + y / 4.0 * (1.0 + y / 5.0 * (1.0 + y / 6.0 * (1.0 + y / 7.0))))));
  highp int biased = int(i) + 127;
  return p * intBitsToFloat(biased << 23);
}
float sdPowPrecise(float v, float y) {
  vec2 l = sdLog2Split(v);
  return sdExp2(l.x * y + l.y * y);
}
float sdPqForward(float lms) {
  float x = lms > 0.0 ? sdPowPrecise(lms / 10000.0, ${Q(ae)}) : 0.0;
  float u = ${Q(kt)} * x / (1.0 + ${Q(ie)} * x);
  return ${Q(At)} * sdExp2(${Q(T / Math.LN2)} * sdLog1p(u));
}
float sdPqInverse(float pq) {
  if (!(pq > ${Q(At)})) return 0.0;
  vec2 l = sdLog2Split(pq * ${Q(1 / At)});
  float u = sdExpm1(l.x * ${Q(Math.LN2 / T)} + l.y * ${Q(Math.LN2 / T)});
  float denom = ${Q(kt)} - ${Q(ie)} * u;
  return denom > 0.0 ? 10000.0 * sdPowPrecise(u / denom, ${Q(1 / ae)}) : 0.0;
}
vec3 sdJzazbz(vec3 xyz) {
  vec3 xp = vec3(${Q(C)} * xyz.x - ${Q(C - 1)} * xyz.z, ${Q(w)} * xyz.y - ${Q(w - 1)} * xyz.x, xyz.z);
  vec3 lms = ${Z(se)} * xp;
  vec3 iab = ${Z(ce)} * vec3(sdPqForward(lms.x), sdPqForward(lms.y), sdPqForward(lms.z));
  return vec3(max(${Q(1 + E)} * iab.x / (1.0 + ${Q(E)} * iab.x) - ${Q(oe)}, 0.0), iab.y, iab.z);
}
vec3 sdJzazbzToXyz(vec3 jab) {
  float iz = jab.x + ${Q(oe)};
  iz = max(iz / (${Q(1 + E)} - ${Q(E)} * iz), 0.0);
  vec3 pq = max(${Z(le)} * vec3(iz, jab.y, jab.z), vec3(0.0));
  vec3 xp = ${Z(ue)} * vec3(sdPqInverse(pq.x), sdPqInverse(pq.y), sdPqInverse(pq.z));
  float sdx = (xp.x + ${Q(C - 1)} * xp.z) / ${Q(C)};
  return vec3(sdx, (xp.y + ${Q(w - 1)} * sdx) / ${Q(w)}, xp.z);
}

// The JzAzBz saturation and brilliance rotation of the J, C plane by T =
// atan2(C, J), up to the gamut mapping.
vec2 sdJzRotate(vec2 jc, float sat, float bril) {
  float t = sdAtan2(jc.y, jc.x);
  float r = length(jc);
  float sinT = r > 0.0 ? jc.y / r : 0.0;
  float cosT = r > 0.0 ? jc.x / r : 1.0;
  float so = jc.x * cosT + jc.y * sinT;
  float o = so * min(max(t * sat, -t), ${Q(Math.PI / 2)} - t);
  so = max(so * bril, 0.0);
  return vec2(max(so * cosT - o * sinT, 0.0), max(so * sinT + o * cosT, 0.0));
}
// The JzAzBz gamut mapping at the hue whose cos and sin are \`dir\`, with the
// LUT's largest C / J there, then the clip of L'M'S' negatives, back to XYZ.
vec3 sdJzGamut(vec2 jc, vec2 dir, float maxSat) {
  float s = jc.x > 0.0 ? sdSoftClip(jc.y / jc.x, 0.8 * maxSat, maxSat) : maxSat;
  float maxCAtSat = jc.x * s;
  float maxJAtSat = s > 0.0 ? jc.y / s : jc.x;
  float j = (jc.x + maxJAtSat) / 2.0;
  float c = (jc.y + maxCAtSat) / 2.0;
  float cosH = dir.x;
  float sinH = dir.y;
  float iz = j + ${Q(oe)};
  iz = max(iz / (${Q(1 + E)} - ${Q(E)} * iz), 0.0);
  float m = c;
${[
	0,
	1,
	2
].map((e) => `  float slope${e} = ${Q(le[3 * e + 1])} * cosH + ${Q(le[3 * e + 2])} * sinH;
  if (slope${e} < 0.0 && iz + c * slope${e} < 0.0) m = min(-iz / slope${e}, m);`).join("\n")}
  return sdJzazbzToXyz(vec3(j, m * cosH, m * sinH));
}

// darktable UCS 22.
float sdPow(float x, float y) {
  return x > 0.0 ? pow(x, y) : 0.0;
}
float sdLStar(float sdy) {
  float yHat = sdPow(sdy, ${Q(he)});
  return ${Q(pe)} * yHat / (yHat + ${Q(ge)});
}
float sdSignedFloor(float d) {
  return d >= 0.0 ? max(${Q(fe)}, d) : min(${Q(-fe)}, d);
}
// XYZ D65 to J, C, H; the hue from the UV' plane, its cos and sin in \`dir\`.
vec3 sdUcsJch(vec3 xyz, float lWhite, out vec2 dir) {
  vec3 p = max(xyz, vec3(0.0));
  float sum = p.x + p.y + p.z;
  vec2 xy = sum > 0.0 ? p.xy / sum : vec2(${Q(de[0])}, ${Q(de[1])});
  vec3 uvd = ${X(Ce)} * xy.x + ${X(we)} * xy.y + ${X(Te)};
  vec2 uv = uvd.xy / sdSignedFloor(uvd.z);
  vec2 star = vec2(${Q(D[0])}, ${Q(D[1])}) * uv / (abs(uv) + vec2(${Q(O[0])}, ${Q(O[1])}));
  vec2 prime = vec2(${Q(k[0])} * star.x + ${Q(k[1])} * star.y, ${Q(k[2])} * star.x + ${Q(k[3])} * star.y);
  float lStar = sdLStar(p.y);
  float m2 = dot(prime, prime);
  dir = m2 > 0.0 ? prime / sqrt(m2) : vec2(1.0, 0.0);
  return vec3(lStar / lWhite, ${Q(ve)} * sdPow(lStar, ${Q(ye)}) * sdPow(m2, ${Q(be)}) / lWhite, sdAtan2(prime.y, prime.x));
}
// J, C and the hue's cos and sin back to XYZ D65.
vec3 sdUcsXyz(vec2 jc, vec2 dir, float lWhite) {
  float lStar = clamp(jc.x * lWhite, 0.0, ${Q(me)});
  float m = lStar != 0.0 ? sdPow(jc.y * lWhite / (${Q(ve)} * pow(lStar, ${Q(ye)})), ${Q(xe)}) : 0.0;
  vec2 prime = m * dir;
  vec2 star = vec2(${Q(A[0])} * prime.x + ${Q(A[1])} * prime.y, ${Q(A[2])} * prime.x + ${Q(A[3])} * prime.y);
  vec2 uv = -vec2(${Q(O[0])}, ${Q(O[1])}) * star / (abs(star) - vec2(${Q(D[0])}, ${Q(D[1])}));
  vec3 xyd = ${X(Ee)} * uv.x + ${X(De)} * uv.y + ${X(Oe)};
  vec2 xy = xyd.xy / sdSignedFloor(xyd.z);
  float sdy = sdPow(${Q(ge)} * lStar / (${Q(pe)} - lStar), ${Q(_e)});
  return xy.y == 0.0 ? vec3(0.0) : vec3(sdy * xy.x / xy.y, sdy, sdy * (1.0 - xy.x - xy.y) / xy.y);
}
float sdBrightness(float j, float c) {
  return j * (sdPow(c, ${Q(Se)}) + 1.0);
}
// The UCS saturation and brilliance rotation in the C, B plane: chroma and
// brightness after it. A pixel without chroma has no direction to turn in,
// and darktable's own result there is its brightness scaled.
vec2 sdUcsRotate(float c, float b, float sat, float bril) {
  float a = max(1.0 + sat, 0.0);
  float bb = max(1.0 + bril, 0.0);
  if (!(c > ${Q(Je)})) return vec2(0.0, length(vec2(c, b)) * bb);
  float radius = length(vec2(c, b));
  float sinT = c / radius;
  float cosT = b / radius;
  float w = sinT * c + cosT * b;
  float maxA = length(vec2(c, w)) / c;
  a = sdSoftClip(a, 0.5 * maxA, maxA);
  float pp = (a - 1.0) * c;
  float wp = sqrt(max(c * c * (1.0 - a * a) + w * w, 0.0)) * bb;
  return vec2(max(cosT * pp + sinT * wp, 0.0), max(-sinT * pp + cosT * wp, 0.0));
}
// The UCS gamut mapping: saturation soft-clipped at constant brightness
// against the boundary the LUT's colourfulness gives at the hue.
vec3 sdUcsGamut(vec2 cb, vec2 dir, float maxM2, float lWhite) {
  float j = cb.y / (sdPow(cb.x, ${Q(Se)}) + 1.0);
  float maxChroma = ${Q(ve)} * sdPow(j * lWhite, ${Q(ye)}) * sdPow(maxM2, ${Q(be)}) / lWhite;
  float boundaryB = sdBrightness(j, maxChroma);
  float boundaryS = boundaryB > 0.0 ? maxChroma / boundaryB : 0.0;
  float s = sdSoftClip(cb.y > 0.0 ? cb.x / cb.y : 0.0, 0.8 * boundaryS, boundaryS);
  float c = s * cb.y;
  return sdUcsXyz(vec2(cb.y / (sdPow(c, ${Q(Se)}) + 1.0), c), dir, lWhite);
}
`, Pt = `
{
  if (sdActive != 0) {
    vec3 sdRgb = max(${Z(u)} * lin, vec3(0.0));
    vec3 sdYrg = sdYrgFromLms(${Z(_)} * sdRgb);
    vec2 sdRg = sdYrg.yz - vec2(${Q(b[0])}, ${Q(b[1])});
    float sdC = length(sdRg);
    vec2 sdHue = sdC != 0.0 ? sdRg / sdC : vec2(1.0, 0.0);
    float sdY = max(sdYrg.x, 0.0);
    vec3 sdOp = sdOpacities(sdPow(sdY, ${Q(Ie)}), sdMasks);

    vec3 sdWlo;
    vec3 sdWhi;
    float sdWskin = sdSliceWeights(atan(sdHue.y, sdHue.x), sdC, sdWlo, sdWhi);
    vec4 sdK = sdWlo.x * sdSlices[0] + sdWlo.y * sdSlices[1] + sdWlo.z * sdSlices[2]
      + sdWhi.x * sdSlices[3] + sdWhi.y * sdSlices[4] + sdWhi.z * sdSlices[5] + sdWskin * sdSlices[6];

    if (sdK.x != 0.0) {
      vec2 sdTurn = sdCosSin(radians(sdK.x));
      sdHue = vec2(sdTurn.x * sdHue.x - sdTurn.y * sdHue.y, sdTurn.y * sdHue.x + sdTurn.x * sdHue.y);
    }
    float sdBoost = sdChroma.x + dot(sdChroma.yzw, sdOp) + sdK.y;
    float sdVib = sdVibrance != 0.0 ? sdVibrance * (1.0 - sdPow(sdC, abs(sdVibrance))) : 0.0;
    sdC = sdGamutCheckYrg(sdC * max(1.0 + sdBoost + sdVib, 0.0), sdHue);
    vec3 sdXyz = ${Z(h)} * sdLmsFromYrg(vec3(sdY, sdC * sdHue + vec2(${Q(b[0])}, ${Q(b[1])})));

    float sdSat = sdSaturation.x + dot(sdSaturation.yzw, sdOp) + sdK.z;
    float sdBril = sdBrilliance.x + dot(sdBrilliance.yzw, sdOp) + sdK.w;
    if (sdFormula == ${j.jzazbz}) {
      vec3 sdJab = sdJzazbz(sdXyz);
      float sdH = sdAtan2(sdJab.z, sdJab.y);
      float sdCz = length(sdJab.yz);
      vec2 sdDir = sdCz > 0.0 ? sdJab.yz / sdCz : vec2(1.0, 0.0);
      vec2 sdJc = sdJzRotate(vec2(sdJab.x, sdCz), sdSat, 1.0 + sdBril);
      vec3 sdQ = sdLutCoord(sdH);
      float sdMax = sdLutValue(texelFetch(sdLut, ivec2(int(sdQ.x), 0), 0).xy, texelFetch(sdLut, ivec2(int(sdQ.y), 0), 0).xy, sdQ, ${Q(1 / $.jzazbz)});
      sdXyz = sdJzGamut(sdJc, sdDir, sdMax);
    } else {
      float sdLw = sdLStar(exp2(sdMasks.w));
      vec2 sdDir;
      vec3 sdJch = sdUcsJch(sdXyz, sdLw, sdDir);
      vec2 sdCb = sdUcsRotate(sdJch.y, sdBrightness(sdJch.x, sdJch.y), sdSat, sdBril);
      vec3 sdQ = sdLutCoord(sdJch.z);
      float sdMax = sdLutValue(texelFetch(sdLut, ivec2(int(sdQ.x), 0), 0).zw, texelFetch(sdLut, ivec2(int(sdQ.y), 0), 0).zw, sdQ, ${Q(1 / $.ucs)});
      sdXyz = sdUcsGamut(sdCb, sdDir, sdMax, sdLw);
    }
    lin = ${Z(d)} * max(${Z(v)} * sdXyz, vec3(0.0));
  }
}
`, Ft = {
	sdFormula: {
		glslType: "int",
		range: {
			min: 0,
			max: 1,
			step: 1
		}
	},
	sdActive: {
		glslType: "int",
		range: {
			min: 0,
			max: 1,
			step: 1
		}
	},
	sdVibrance: {
		glslType: "float",
		range: {
			min: -1,
			max: 1
		}
	}
}, It = {
	sdFormula: "saturation formula",
	sdActive: "active",
	sdChroma: "chroma",
	sdSaturation: "saturation",
	sdBrilliance: "brilliance",
	sdMasks: "masks",
	sdVibrance: "vibrance",
	sdSlices: "colour slices"
};
function Lt() {
	let e = nt(P);
	return Xe.map((t) => {
		let n = e[R(t)], r = It[t], i = Ft[t];
		return i ? {
			key: t,
			glslType: i.glslType,
			default: n,
			label: r,
			range: i.range
		} : t === "sdSlices" ? {
			key: t,
			glslType: "vec4",
			length: N,
			default: n,
			label: r
		} : {
			key: t,
			glslType: "vec4",
			default: n,
			label: r
		};
	});
}
function Rt() {
	return {
		id: L,
		name: "Saturation & Density",
		phase: "scene-linear",
		priority: 90,
		after: ["colour-equaliser.rings"],
		glsl: Pt,
		helpers: Nt,
		uniforms: Lt(),
		textures: [{
			key: wt,
			kind: "lut",
			width: 512,
			height: 1,
			format: "rgba16f"
		}],
		presetScope: "global",
		mask: { maskable: !0 },
		dormantWhen: { sdActive: 0 }
	};
}
//#endregion
//#region src/index.tsx
var zt = `${Ye}.panel`;
function Bt() {
	let e = K.stores.useDevelopStore.getState();
	e.setDynParams(ct()), e.commitEdit("Saturation & Density reset");
}
var Vt = null;
function Ht(e) {
	ut(e), ft(), Vt = e, e.registerProcessingStage(Rt()), e.setStageTexture(L, wt, Ot()), e.registerPanel({
		id: zt,
		title: "Saturation & Density",
		component: St,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 268
		},
		onReset: Bt,
		mask: {
			component: St,
			owns: Xe.map(R)
		}
	});
}
function Ut() {
	let e = Vt;
	if (e) {
		Vt = null;
		try {
			e.unregisterProcessingStage(L);
		} catch (e) {
			console.warn("[saturation-density] deactivate failed:", e);
		}
	}
}
//#endregion
export { Ye as EXT_ID, zt as PANEL_ID, Ht as activate, Ut as deactivate };

//# sourceMappingURL=index.js.map