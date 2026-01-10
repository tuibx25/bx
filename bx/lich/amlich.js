/**
 * Copyright 2004 Tui Binh Xuyen [https://sites.google.com/site/vatlyphothongtrunghoc]. All Rights Reserved.<p>
 * Permission to use, copy, modify, and redistribute this software and its
 * documentation for personal, non-commercial use is hereby granted provided that
 * this copyright notice appears in all copies.
 */

/**
 * Originally owned by Tui Binh Xuyen
 * Version v. 0.85
 * Modified 2007, BinhXuyen, http://bx.site90.com
 * This software is allowed to use only for noncommercial purposes.
 * Ask the authors for commercial use.
 * THERE IS NO WARRANTY FOR THE PROGRAM BECAUSE IT IS LICENSED FREE OF CHARGE.
 */

var ABOUT = "\u00C2m l\u1ECBch Vi\u1EC7t Nam - Version 0.8"+"\n\u00A9 2004 H\u1ED3 Ng\u1ECDc \u0110\u1EE9c [http://bx.site90.com]";
var TK19 = new Array(
	0x30baa3, 0x56ab50, 0x422ba0, 0x2cab61, 0x52a370, 0x3c51e8, 0x60d160, 0x4ae4b0, 0x376926, 0x58daa0,
	0x445b50, 0x3116d2, 0x562ae0, 0x3ea2e0, 0x28e2d2, 0x4ec950, 0x38d556, 0x5cb520, 0x46b690, 0x325da4,
	0x5855d0, 0x4225d0, 0x2ca5b3, 0x52a2b0, 0x3da8b7, 0x60a950, 0x4ab4a0, 0x35b2a5, 0x5aad50, 0x4455b0,
	0x302b74, 0x562570, 0x4052f9, 0x6452b0, 0x4e6950, 0x386d56, 0x5e5aa0, 0x46ab50, 0x3256d4, 0x584ae0,
	0x42a570, 0x2d4553, 0x50d2a0, 0x3be8a7, 0x60d550, 0x4a5aa0, 0x34ada5, 0x5a95d0, 0x464ae0, 0x2eaab4,
	0x54a4d0, 0x3ed2b8, 0x64b290, 0x4cb550, 0x385757, 0x5e2da0, 0x4895d0, 0x324d75, 0x5849b0, 0x42a4b0,
	0x2da4b3, 0x506a90, 0x3aad98, 0x606b50, 0x4c2b60, 0x359365, 0x5a9370, 0x464970, 0x306964, 0x52e4a0,
	0x3cea6a, 0x62da90, 0x4e5ad0, 0x392ad6, 0x5e2ae0, 0x4892e0, 0x32cad5, 0x56c950, 0x40d4a0, 0x2bd4a3,
	0x50b690, 0x3a57a7, 0x6055b0, 0x4c25d0, 0x3695b5, 0x5a92b0, 0x44a950, 0x2ed954, 0x54b4a0, 0x3cb550,
	0x286b52, 0x4e55b0, 0x3a2776, 0x5e2570, 0x4852b0, 0x32aaa5, 0x56e950, 0x406aa0, 0x2abaa3, 0x50ab50
); /* Years 2000-2099 */

var TK20 = new Array(
	0x3c4bd8, 0x624ae0, 0x4ca570, 0x3854d5, 0x5cd260, 0x44d950, 0x315554, 0x5656a0, 0x409ad0, 0x2a55d2,
	0x504ae0, 0x3aa5b6, 0x60a4d0, 0x48d250, 0x33d255, 0x58b540, 0x42d6a0, 0x2cada2, 0x5295b0, 0x3f4977,
	0x644970, 0x4ca4b0, 0x36b4b5, 0x5c6a50, 0x466d50, 0x312b54, 0x562b60, 0x409570, 0x2c52f2, 0x504970,
	0x3a6566, 0x5ed4a0, 0x48ea50, 0x336a95, 0x585ad0, 0x442b60, 0x2f86e3, 0x5292e0, 0x3dc8d7, 0x62c950,
	0x4cd4a0, 0x35d8a6, 0x5ab550, 0x4656a0, 0x31a5b4, 0x5625d0, 0x4092d0, 0x2ad2b2, 0x50a950, 0x38b557,
	0x5e6ca0, 0x48b550, 0x355355, 0x584da0, 0x42a5b0, 0x2f4573, 0x5452b0, 0x3ca9a8, 0x60e950, 0x4c6aa0,
	0x36aea6, 0x5aab50, 0x464b60, 0x30aae4, 0x56a570, 0x405260, 0x28f263, 0x4ed940, 0x38db47, 0x5cd6a0,
	0x4896d0, 0x344dd5, 0x5a4ad0, 0x42a4d0, 0x2cd4b4, 0x52b250, 0x3cd558, 0x60b540, 0x4ab5a0, 0x3755a6,
	0x5c95b0, 0x4649b0, 0x30a974, 0x56a4b0, 0x40aa50, 0x29aa52, 0x4e6d20, 0x39ad47, 0x5eab60, 0x489370,
	0x344af5, 0x5a4970, 0x4464b0, 0x2c74a3, 0x50ea50, 0x3d6a58, 0x6256a0, 0x4aaad0, 0x3696d5, 0x5c92e0
); /* Years 1900-1999 */

var TK21 = new Array(
	0x46c960, 0x2ed954, 0x54d4a0, 0x3eda50, 0x2a7552, 0x4e56a0, 0x38a7a7, 0x5ea5d0, 0x4a92b0, 0x32aab5,
	0x58a950, 0x42b4a0, 0x2cbaa4, 0x50ad50, 0x3c55d9, 0x624ba0, 0x4ca5b0, 0x375176, 0x5c5270, 0x466930,
	0x307934, 0x546aa0, 0x3ead50, 0x2a5b52, 0x504b60, 0x38a6e6, 0x5ea4e0, 0x48d260, 0x32ea65, 0x56d520,
	0x40daa0, 0x2d56a3, 0x5256d0, 0x3c4afb, 0x6249d0, 0x4ca4d0, 0x37d0b6, 0x5ab250, 0x44b520, 0x2edd25,
	0x54b5a0, 0x3e55d0, 0x2a55b2, 0x5049b0, 0x3aa577, 0x5ea4b0, 0x48aa50, 0x33b255, 0x586d20, 0x40ad60,
	0x2d4b63, 0x525370, 0x3e49e8, 0x60c970, 0x4c54b0, 0x3768a6, 0x5ada50, 0x445aa0, 0x2fa6a4, 0x54aad0,
	0x4052e0, 0x28d2e3, 0x4ec950, 0x38d557, 0x5ed4a0, 0x46d950, 0x325d55, 0x5856a0, 0x42a6d0, 0x2c55d4,
	0x5252b0, 0x3ca9b8, 0x62a930, 0x4ab490, 0x34b6a6, 0x5aad50, 0x4655a0, 0x2eab64, 0x54a570, 0x4052b0,
	0x2ab173, 0x4e6930, 0x386b37, 0x5e6aa0, 0x48ad50, 0x332ad5, 0x582b60, 0x42a570, 0x2e52e4, 0x50d160,
	0x3ae958, 0x60d520, 0x4ada90, 0x355aa6, 0x5a56d0, 0x462ae0, 0x30a9d4, 0x54a2d0, 0x3ed150, 0x28e952
); /* Years 2000-2099 */

var TK22 = new Array(
		0x4eb520, 0x38d727, 0x5eada0, 0x4a55b0, 0x362db5, 0x5a45b0, 0x44a2b0, 0x2eb2b4, 0x54a950, 0x3cb559,
		0x626b20, 0x4cad50, 0x385766, 0x5c5370, 0x484570, 0x326574, 0x5852b0, 0x406950, 0x2a7953, 0x505aa0,
		0x3baaa7, 0x5ea6d0, 0x4a4ae0, 0x35a2e5, 0x5aa550, 0x42d2a0, 0x2de2a4, 0x52d550, 0x3e5abb, 0x6256a0,
		0x4c96d0, 0x3949b6, 0x5e4ab0, 0x46a8d0, 0x30d4b5, 0x56b290, 0x40b550, 0x2a6d52, 0x504da0, 0x3b9567,
		0x609570, 0x4a49b0, 0x34a975, 0x5a64b0, 0x446a90, 0x2cba94, 0x526b50, 0x3e2b60, 0x28ab61, 0x4c9570,
		0x384ae6, 0x5cd160, 0x46e4a0, 0x2eed25, 0x54da90, 0x405b50, 0x2c36d3, 0x502ae0, 0x3a93d7, 0x6092d0,
		0x4ac950, 0x32d556, 0x58b4a0, 0x42b690, 0x2e5d94, 0x5255b0, 0x3e25fa, 0x6425b0, 0x4e92b0, 0x36aab6,
		0x5c6950, 0x4674a0, 0x31b2a5, 0x54ad50, 0x4055a0, 0x2aab73, 0x522570, 0x3a5377, 0x6052b0, 0x4a6950,
		0x346d56, 0x585aa0, 0x42ab50, 0x2e56d4, 0x544ae0, 0x3ca570, 0x2864d2, 0x4cd260, 0x36eaa6, 0x5ad550,
		0x465aa0, 0x30ada5, 0x5695d0, 0x404ad0, 0x2aa9b3, 0x50a4d0, 0x3ad2b7, 0x5eb250, 0x48b540, 0x33d556
); /* Years 2100-2199 */

var CAN = new Array("Gi\341p", "\u1EA4t", "B\355nh", "\u0110inh", "M\u1EADu", "K\u1EF7", "Canh", "T\342n", "Nh\342m", "Qu\375");
var CHI = new Array("T\375", "S\u1EEDu", "D\u1EA7n", "M\343o", "Th\354n", "T\u1EF5", "Ng\u1ECD", "M\371i", "Th\342n", "D\u1EADu", "Tu\u1EA5t", "H\u1EE3i");
var TUAN = new Array("Ch\u1EE7 nh\u1EADt", "Th\u1EE9 hai", "Th\u1EE9 ba", "Th\u1EE9 t\u01B0", "Th\u1EE9 n\u0103m", "Th\u1EE9 s\341u", "Th\u1EE9 b\u1EA3y");
var NTBT = new Array("Gi\341c", "Cang", "\u0110\352", "Ph\362ng", "T\342m", "V\u0129", "C\u01A1", "\u0110\u1EA9u", "Ng\u01B0u", "N\u1EEF", "H\u01B0", "Nguy", "Th\u1EA5t", "B\355ch", "Khu\352", "L\342u", "V\u1ECB", "M\343o", "T\u1EA5t", "Ch\u1EE7y", "S\342m", "T\u1EC9nh", "Qu\u1EF7", "Li\u1EC5u", "Tinh", "Tr\u01B0\u01A1ng", "D\u1EF1c", "Ch\u1EA9n");
var SAO_HD = new Array("Thanh Long", "Minh \u0110\u01B0\u1EDDng", "Thi\352n H\354nh", "Chu T\u01B0\u1EDBc", "Kim Qu\u1EF9", "Kim \u0110\u01B0\u1EDDng", "B\u1EA1ch H\u1ED5", "Ng\u1ECDc \u0110\u01B0\u1EDDng", "Thi\352n Lao", "Nguy\352n V\u0169", "T\u01B0 M\u1EC7nh", "C\342u Tr\u1EA7n");
var GIO_HD = new Array("110100101100", "001101001011", "110011010010", "101100110100", "001011001101", "010010110011");
var TIETKHI = new Array("Xu\u00E2n ph\u00E2n", "Thanh minh", "C\u1ED1c v\u0169", "L\u1EADp h\u1EA1", "Ti\u1EC3u m\u00E3n", "Mang ch\u1EE7ng",
	"H\u1EA1 ch\u00ED", "Ti\u1EC3u th\u1EED", "\u0110\u1EA1i th\u1EED", "L\u1EADp thu", "X\u1EED th\u1EED", "B\u1EA1ch l\u1ED9",
	"Thu ph\u00E2n", "H\u00E0n l\u1ED9", "S\u01B0\u01A1ng gi\u00E1ng", "L\u1EADp \u0111\u00F4ng", "Ti\u1EC3u tuy\u1EBFt", "\u0110\u1EA1i tuy\u1EBFt",
	"\u0110\u00F4ng ch\u00ED", "Ti\u1EC3u h\u00E0n", "\u0110\u1EA1i h\u00E0n", "L\u1EADp xu\u00E2n", "V\u0169 Th\u1EE7y", "Kinh tr\u1EADp"
);

/* Create lunar date object, stores (lunar) date, month, year, leap month indicator, and Julian date number */
function LunarDate(dd, mm, yy, leap, jd) {
	this.day = dd;
	this.month = mm;
	this.year = yy;
	this.leap = leap;
	this.jd = jd;
}

var PI = Math.PI;

/* Discard the fractional part of a number, e.g., INT(3.2) = 3 */
function INT(d) {
	return Math.floor(d);
}

function jdn(dd, mm, yy) {
	var a = INT((14 - mm) / 12);
	var y = yy+4800-a;
	var m = mm+12*a-3;
	var jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - INT(y/100) + INT(y/400) - 32045;
	return jd;
}

function jdn2date(jd) {
	var Z, A, alpha, B, C, D, E, dd, mm, yyyy, F;
	Z = jd;
	if (Z < 2299161) {
	  A = Z;
	} else {
	  alpha = INT((Z-1867216.25)/36524.25);
	  A = Z + 1 + alpha - INT(alpha/4);
	}
	B = A + 1524;
	C = INT( (B-122.1)/365.25);
	D = INT( 365.25*C );
	E = INT( (B-D)/30.6001 );
	dd = INT(B - D - INT(30.6001*E));
	if (E < 14) {
	  mm = E - 1;
	} else {
	  mm = E - 13;
	}
	if (mm < 3) {
	  yyyy = C - 4715;
	} else {
	  yyyy = C - 4716;
	}
	return new Array(dd, mm, yyyy);
}

function decodeLunarYear(yy, k) {
	var monthLengths, regularMonths, offsetOfTet, leapMonth, leapMonthLength, solarNY, currentJD, j, mm;
	var ly = new Array();
	monthLengths = new Array(29, 30);
	regularMonths = new Array(12);
	offsetOfTet = k >> 17;
	leapMonth = k & 0xf;
	leapMonthLength = monthLengths[k >> 16 & 0x1];
	solarNY = jdn(1, 1, yy);
	currentJD = solarNY+offsetOfTet;
	j = k >> 4;
	for(i = 0; i < 12; i++) {
		regularMonths[12 - i - 1] = monthLengths[j & 0x1];
		j >>= 1;
	}
	if (leapMonth == 0) {
		for(mm = 1; mm <= 12; mm++) {
			ly.push(new LunarDate(1, mm, yy, 0, currentJD));
			currentJD += regularMonths[mm-1];
		}
	} else {
		for(mm = 1; mm <= leapMonth; mm++) {
			ly.push(new LunarDate(1, mm, yy, 0, currentJD));
			currentJD += regularMonths[mm-1];
		}
		ly.push(new LunarDate(1, leapMonth, yy, 1, currentJD));
		currentJD += leapMonthLength;
		for(mm = leapMonth+1; mm <= 12; mm++) {
			ly.push(new LunarDate(1, mm, yy, 0, currentJD));
			currentJD += regularMonths[mm-1];
		}
	}
	return ly;
}

function getYearInfo(yyyy) {
	var yearCode;
	if (yyyy < 1900) {
		yearCode = TK19[yyyy - 1800];
	} else if (yyyy < 2000) {
		yearCode = TK20[yyyy - 1900];
	} else if (yyyy < 2100) {
		yearCode = TK21[yyyy - 2000];
	} else {
		yearCode = TK22[yyyy - 2100];
	}
	return decodeLunarYear(yyyy, yearCode);
}

var FIRST_DAY = jdn(25, 1, 1800); // Tet am lich 1800
var LAST_DAY = jdn(31, 12, 2199);

function findLunarDate(jd, ly) {
	if (jd > LAST_DAY || jd < FIRST_DAY || ly[0].jd > jd) {
		return new LunarDate(0, 0, 0, 0, jd);
	}
	var i = ly.length-1;
	while (jd < ly[i].jd) {
		i--;
	}
	var off = jd - ly[i].jd;
	ret = new LunarDate(ly[i].day+off, ly[i].month, ly[i].year, ly[i].leap, jd);
	return ret;
}

function getLunarDate(dd, mm, yyyy) {
	var ly, jd;
	if (yyyy < 1800 || 2199 < yyyy) {
	}
	ly = getYearInfo(yyyy);
	jd = jdn(dd, mm, yyyy);
	if (jd < ly[0].jd) {
		ly = getYearInfo(yyyy - 1);
	}
	return findLunarDate(jd, ly);
}

/* Compute the longitude of the sun at any time.
 * Parameter: floating number jdn, the number of days since 1/1/4713 BC noon
 * Algorithm from: "Astronomical Algorithms" by Jean Meeus, 1998
 */
function SunLongitude(jdn) {
	var T, T2, dr, M, L0, DL, lambda, theta, omega;
	T = (jdn - 2451545.0 ) / 36525; // Time in Julian centuries from 2000-01-01 12:00:00 GMT
	T2 = T*T;
	dr = PI/180; // degree to radian
	M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2; // mean anomaly, degree
	L0 = 280.46645 + 36000.76983*T + 0.0003032*T2; // mean longitude, degree
	DL = (1.914600 - 0.004817*T - 0.000014*T2)*Math.sin(dr*M);
	DL = DL + (0.019993 - 0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
    theta = L0 + DL; // true longitude, degree
    // obtain apparent longitude by correcting for nutation and aberration
    omega = 125.04 - 1934.136 * T;
    lambda = theta - 0.00569 - 0.00478 * Math.sin(omega * dr);
    // Convert to radians
    lambda = lambda*dr;
    lambda = lambda - PI*2*(INT(lambda/(PI*2))); // Normalize to (0, 2*PI)
    return lambda;
}

/* Compute the sun segment at start (00:00) of the day with the given integral Julian day number.
 * The time zone if the time difference between local time and UTC: 7.0 for UTC+7:00.
 * The function returns a number between 0 and 23.
 * From the day after March equinox and the 1st major term after March equinox, 0 is returned.
 * After that, return 1, 2, 3 ...
 */
function getSunLongitude(dayNumber, timeZone) {
	return INT(SunLongitude(dayNumber - 0.5 - timeZone/24.0) / PI * 12);
}

var today = new Date();
var currentLunarDate = getLunarDate(today.getDate(), today.getMonth()+1, today.getFullYear());
var currentMonth = today.getMonth()+1;
var currentYear = today.getFullYear();

function getSelectedMonth() {
	currentMonth = parseInt(getUrlValue('mm'));
	currentYear = parseInt(getUrlValue('yy'));
	if (isNaN(currentMonth)) currentMonth = today.getMonth()+1;
	if (isNaN(currentYear)) currentYear = today.getFullYear();
	if (currentYear < 1800) currentYear = 1800;
	if (currentYear > 2199) currentYear = 2199;
}

function getMonth(mm, yy) {
	var ly1, ly2, tet1, jd1, jd2, mm1, yy1, result, i;
	if (mm < 12) {
		mm1 = mm + 1;
		yy1 = yy;
	} else {
		mm1 = 1;
		yy1 = yy + 1;
	}
	jd1 = jdn(1, mm, yy);
	jd2 = jdn(1, mm1, yy1);
	ly1 = getYearInfo(yy);
	tet1 = ly1[0].jd;
	result = new Array();
	if (tet1 <= jd1) {
		for (i = jd1; i < jd2; i++) {
			result.push(findLunarDate(i, ly1));
		}
	} else if (jd1 < tet1 && jd2 < tet1) {
		ly1 = getYearInfo(yy - 1);
		for (i = jd1; i < jd2; i++) {
			result.push(findLunarDate(i, ly1));
		}
	} else if (jd1 < tet1 && tet1 <= jd2) {
		ly2 = getYearInfo(yy - 1);
		for (i = jd1; i < tet1; i++) {
			result.push(findLunarDate(i, ly2));
		}
		for (i = tet1; i < jd2; i++) {
			result.push(findLunarDate(i, ly1));
		}
	}
	return result;
}

function getDayName(lunarDate) {
	if (lunarDate.day == 0) {
		return "";
	}
	var cc = getCanChi(lunarDate);
	var s = "Ng\u00E0y " + cc[0] +", th\341ng "+cc[1] + ", n\u0103m " + cc[2];
	return s;
}

function getYearCanChi(year) {
	return CAN[(year+6) % 10] + " " + CHI[(year+8) % 12];
}

/*
 * Can cua gio Chinh Ty (00:00) cua ngay voi JDN nay
 */
function getCanHour0(jdn) {
	return CAN[(jdn-1)*2 % 10];
}

function getCanChi(lunar) {
	var dayName, monthName, yearName;
	dayName = CAN[(lunar.jd + 9) % 10] + " " + CHI[(lunar.jd+1)%12];
	monthName = CAN[(lunar.year*12+lunar.month+3) % 10] + " " + CHI[(lunar.month+1)%12];
	if (lunar.leap == 1) {
		monthName += " (nhu\u1EADn)";
	}
	yearName = getYearCanChi(lunar.year);
	return new Array(dayName, monthName, yearName);
}

function getDayString(lunar, solarDay, solarMonth, solarYear) {
	var s;
	var dayOfWeek = TUAN[(lunar.jd + 1) % 7];
	s = dayOfWeek + " " + solarDay + "/" + solarMonth + "/" + solarYear + '\n';
	s += "Ng\u00E0y " + lunar.day+" th\341ng "+lunar.month;
	if (lunar.leap == 1) {
		s = s + " nhu\u1EADn";
	}
	return s;
}

function getTodayString() {
	var s = getDayString(currentLunarDate, today.getDate(), today.getMonth()+1, today.getFullYear());
	s += " n\u0103m " + getYearCanChi(currentLunarDate.year);
	return s;
}

function getDayWeekString(name) {
    if (name == "CN") return TUAN[0];
    else if (name == "T2") return TUAN[1];
    else if (name == "T3") return TUAN[2];
    else if (name == "T4") return TUAN[3];
    else if (name == "T5") return TUAN[4];
    else if (name == "T6") return TUAN[5];
    else if (name == "T7") return TUAN[6];
    else return "";
}

function getCurrentTime() {
	today = new Date();
	var Std = today.getHours();
	var Min = today.getMinutes();
	var Sec = today.getSeconds();
	var s1  = ((Std < 10) ? "0" + Std : Std);
	var s2  = ((Min < 10) ? "0" + Min : Min);
	return s1 + ":" + s2;
}

function getGioHoangDao(jd) {
	var chiOfDay = (jd+1) % 12;
	var gioHD = GIO_HD[chiOfDay % 6];
	var ret = "";
	var count = 0;
	for (var i = 0; i < 12; i++) {
		if (gioHD.charAt(i) == '1') {
			ret += CHI[i];
			ret += ' ('+(i*2+23)%24+'-'+(i*2+1)%24+')';
			if (count++ < 5) ret += ', ';
			if (count == 3) ret += '\n';
		}
	}
	return ret;
}

function getSaoHoangDao(mm, jd) {
	var chiOfThanhLong = (2 * mm - 2) % 12;
	var chiOfSoc = floorDiv(jd + 1, 12)[1];
	var dayOfThanhLong = jd + floorDiv(chiOfThanhLong - chiOfSoc, 12)[1];
	var idx = floorDiv(jd - dayOfThanhLong, 12)[1];
	return SAO_HD[idx];
}

function getSaoNTBT(jd) {
	return NTBT[floorDiv(jd + 11, 28)[1]];
}

function floorDiv(x, y) {
	var ret = INT(Math.floor(x / y));
	var rest = x - ret * y;
	return new Array(ret, rest);
}

var DAYNAMES = new Array("T2", "T3", "T4", "T5", "T6", "T7", "CN");

function printSelectedMonth() {
	if (!dynamic) getSelectedMonth();
	return printMonth(currentMonth, currentYear, true);
}

function printMonth(mm, yy, monthLink) {
	var res = "";
	//res += printStyle();
	res += printTable(mm, yy, monthLink);
	//res += printFoot();
	return res;
}

function printYear(yy) {
	var yearName = "N&#x103;m " + getYearCanChi(yy) + " " + yy;
	var res = "";
	//res += printStyle() + printSubStyle();
	res += '<table>\n';
	//res += '<tr><td colspan="3" class="tennam" onclick="showYearSelect();">'+yearName+'</td></tr>\n';
	res += '<tr><td colspan="'+column+'" class="tennam">'+yearName+'</td></tr>\n';
	for (var i = 1; i<= 12; i++) {
		if (i % column == 1) res += '<tr>\n';
		res += '<td>\n';
		res += printTable(i, yy, false);
		res += '</td>\n';
		if (i % column == 0) res += '</tr>\n';
	}
	res += '</table>\n';
	//res += printFoot();
	return res;
}

function printSelectedYear() {
	if (!dynamic) getSelectedMonth();
	return printYear(currentYear);
}

function printStyle() {
	return '<link rel="stylesheet" href="css/calendar.css" type="text/css"/>\n';
}

function printSubStyle() {
	return '<link rel="stylesheet" href="css/calendar_month.css" type="text/css"/>\n';
}

function printTable(mm, yy, monthLink) {
	var i, j, k, solar, lunar, cellClass, solarClass, lunarClass;
	var currentMonth = getMonth(mm, yy);
	if (currentMonth.length == 0) return;
	var ld1 = currentMonth[0];
	var emptyCells = ld1.jd % 7;
	var MonthHead = mm + "/" + yy;
	var LunarHead = getYearCanChi(ld1.year);
	var res = "";
	res += ('<table class="thang">\n');
	res += printHead(mm, yy, monthLink);
	for (i = 0; i < 6; i++) {
		res += ("<tr>\n");
		for (j = 0; j < 7; j++) {
			k = 7 * i + j;
			if (k < emptyCells || k >= emptyCells + currentMonth.length) {
				res += printEmptyCell();
			} else {
				solar = k - emptyCells + 1;
				ld1 = currentMonth[k - emptyCells];
				res += printCell(ld1, solar, mm, yy);
			}
		}
		res += ("</tr>\n");
	}
	res += ('</table>\n');
	return res;
}

var dynamic = true;
var column = 1;
var view = 0;

function drawCalendar(yy, mm, vw, cl) {
	var s;
	currentMonth = mm;
	currentYear = yy;
	view = vw;
	column = cl;
	if (view == 1) s = printSelectedYear();
	else s = printSelectedMonth();
	document.getElementById('Calendar').innerHTML = s;
}

function getPrevMonthLink(mm, yy) {
	var mm1 = mm > 1 ? mm-1 : 12;
	var yy1 = mm > 1 ? yy : yy-1;
	var res;
	if (dynamic) {
		res = '<a href="#" onclick="drawCalendar('+yy1+','+mm1+','+view+','+column+'); return false;">&#8249;</a>';
	}
	else {
		res = window.location.pathname+'?'+getUrlParameters();
		res = '<a href="'+res+'yy='+yy1+'&amp;mm='+mm1+'&amp;view='+getView()+'&amp;column='+getColumn()+'">&#8249;</a>';
	}
	return res;
}

function getNextMonthLink(mm, yy) {
	var mm1 = mm < 12 ? mm+1 : 1;
	var yy1 = mm < 12 ? yy : yy+1;
	var res;
	if (dynamic) {
		res = '<a href="#" onclick="drawCalendar('+yy1+','+mm1+','+view+','+column+'); return false;">&#8250;</a>';
	}
	else {
		res = window.location.pathname+'?'+getUrlParameters();
		res = '<a href="'+res+'yy='+yy1+'&amp;mm='+mm1+'&amp;view='+getView()+'&amp;column='+getColumn()+'">&#8250;</a>';
	}
	return res;
}

function getPrevYearLink(mm, yy) {
	var res;
	if (dynamic) {
		res = '<a href="#" onclick="drawCalendar('+(yy-1)+','+mm+','+view+','+column+'); return false;">&#171;</a>';
	}
	else {
		res = window.location.pathname+'?'+getUrlParameters();
		res = '<a href="'+res+'yy='+(yy-1)+'&amp;mm='+mm+'&amp;view='+getView()+'&amp;column='+getColumn()+'">&#171;</a>';
	}
	return res;
}

function getNextYearLink(mm, yy) {
	var res;
	if (dynamic) {
		res = '<a href="#" onclick="drawCalendar('+(yy+1)+','+mm+','+view+','+column+'); return false;">&#187;</a>';
	}
	else {
		res = window.location.pathname+'?'+getUrlParameters();
		res = '<a href="'+res+'yy='+(yy+1)+'&amp;mm='+mm+'&amp;view='+getView()+'&amp;column='+getColumn()+'">&#187;</a>';
	}
	return res;	
}

function getView() {
	var view = parseInt(getUrlValue('view'));
	if (isNaN(view)) view = 0;
	if (view != 0 && view != 1) view = 0;
	return view;
}

function getColumn() {
	var cl = parseInt(getUrlValue('column'));
	if (isNaN(cl)) cl = column;
	if (cl < 0) cl = 1;
	if (cl > 12) cl = 12;
	return cl;
}

var ignore = new Array('mm', 'yy', 'view', 'column');

function getUrlParameters() {
	var i, j;
	var arr;
	var found;
	var query = window.location.search;
	if (query.length <= 1) return '';
	query = query.substring(1, query.length);
	arr = query.split('&');
	query = '';
	for (i = 0; i < arr.length; i++) {
		for (j = 0; j < ignore.length; j++) {
			found = false;
			if (arr[i].indexOf(ignore[j]+'=') == 0) {
				found = true;
				break;
			}
		}
		if (!found) query += arr[i] + '&amp;';
	}
	return query;
}

function getUrlValue(key) {
	var i, j;
	var arr;
	var found;
	var res = '';
	var query = window.location.search;
	if (query.length <= 1) return res;
	query = query.substring(1, query.length);
	arr = query.split('&');
	for (i = 0; i < arr.length; i++) {
		if (arr[i].indexOf(key+'=') == 0) {
			var v = arr[i].split('=');
			if (v.length > 1) res = v[1];
			break;
		}
	}
	return res;
}

function printHead(mm, yy, monthLink) {
	var res = "";
	var monthName = mm+"/"+yy;
	res += '<tr><td colspan="2" class="navi-l">'+getPrevYearLink(mm, yy);
	if (monthLink) res+= '&nbsp;&nbsp;'+getPrevMonthLink(mm, yy);
	res +='</td>\n';
	res += '<td colspan="3" class="tenthang">'+monthName+'</td>\n';
	res += '<td colspan="2" class="navi-r">';
	if (monthLink) res += getNextMonthLink(mm, yy)+'&nbsp;&nbsp;';
	res += getNextYearLink(mm, yy)+'</td></tr>\n';
	res += '<tr>\n';
	for(var i=0;i<=4;i++) {
		res += '<td class="ngaytuan" title="'+getDayWeekString(DAYNAMES[i])+'">'+DAYNAMES[i]+'</td>\n';
	}
	res += '<td class="ngaytuant7" title="'+getDayWeekString(DAYNAMES[5])+'">'+DAYNAMES[5]+'</td>\n';
	res += '<td class="ngaytuancn" title="'+getDayWeekString(DAYNAMES[6])+'">'+DAYNAMES[6]+'</td>\n';
	res += '</tr>\n';
	return res;
}

function printEmptyCell() {
	return '<td class="ngaythang"><div class="cn">&nbsp;</div><div class="am">&nbsp;</div></td>\n';
}

function printCell(lunarDate, solarDate, solarMonth, solarYear) {
	var cellClass, solarClass, lunarClass;
	cellClass = "ngaythang";
	solarClass = "t2t6";
	lunarClass = "am";
	var dow = (lunarDate.jd + 1) % 7;
	if (dow == 0) {
		solarClass = "cn";
	} else if (dow == 6) {
		solarClass = "t7";
	}
	if (solarDate == today.getDate() && solarMonth == today.getMonth()+1 && solarYear == today.getFullYear()) {
		cellClass = "homnay";
	}
	if (lunarDate.day == 1 && lunarDate.month == 1) {
		cellClass = "tet";
	}
	if (lunarDate.leap == 1) {
		lunarClass = "am2";
	}
	var lunar = lunarDate.day;
	if (solarDate == 1 || lunar == 1) {
		lunar = lunarDate.day + "/" + lunarDate.month;
	}
	var res = "";
	var args = lunarDate.day + "," + lunarDate.month + "," + lunarDate.year + "," + lunarDate.leap;
	args += "," + lunarDate.jd + "," + solarDate + "," + solarMonth + "," + solarYear;
	res += '<td class="'+cellClass+'"';
	//if (lunarDate != null) res += ' title="'+getDayName(lunarDate)+'" onclick="alertDayInfo('+args+');">';
	if (lunarDate != null) {
		res += ' title="'+getDayName(lunarDate);
		res += '" onmouseover="showDayInfo('+args+');" onmouseout="cleanInfo();">';
	}
	res += '<div class="'+solarClass+'">'+solarDate+'</div><div class="'+lunarClass+'">'+lunar+'</div></td>\n';
	return res;
}

function printFoot() {
	var res = "";
	res += '<script language="JavaScript" src="scripts/amlich.js"></script>\n';
	return res;
}

function showYearSelect() {
	window.print();
}

function alertDayInfo(dd, mm, yy, leap, jd, sday, smonth, syear) {
	var lunar = new LunarDate(dd, mm, yy, leap, jd);
	var s = getDayString(lunar, sday, smonth, syear);
	s += " \u00E2m l\u1ECBch\n";
	s += getDayName(lunar);
	s += "\nGi\u1EDD \u0111\u1EA7u ng\u00E0y: "+getCanHour0(jd)+" "+CHI[0];
	s += "\nTi\u1EBFt: "+TIETKHI[getSunLongitude(jd+1, 7.0)];
	s += "\nGi\u1EDD ho\u00E0ng \u0111\u1EA1o: "+getGioHoangDao(jd);
	alert(s);
}

function showDayInfo(dd, mm, yy, leap, jd, sday, smonth, syear) {
	var lunar = new LunarDate(dd, mm, yy, leap, jd);
	var s = getDayString(lunar, sday, smonth, syear);
	s += " \u00E2m l\u1ECBch<br/><br/>";
	s += getDayName(lunar);
	s += "<br/><br/>Gi\u1EDD \u0111\u1EA7u ng\u00E0y: " + getCanHour0(jd) + " " + CHI[0];
	s += "<br/><br/>Ti\u1EBFt: " + TIETKHI[getSunLongitude(jd+1, 7.0)];
	s += "<br/><br/>Sao: " + getSaoNTBT(jd);
	s += "<br/><br/>Sao ho\u00E0ng \u0111\u1EA1o: " + getSaoHoangDao(mm, jd);
	s += "<br/><br/>Gi\u1EDD ho\u00E0ng \u0111\u1EA1o: " + getGioHoangDao(jd);
	document.getElementById('CalendarInfo').innerHTML = s;
}

function cleanInfo() {
	document.getElementById('CalendarInfo').innerHTML = '';
}

function showVietCal() {
	window.status = getCurrentTime() + " -+- " + getTodayString();
	window.window.setTimeout("showVietCal()",5000);
}

function alertAbout() {
	alert(ABOUT);
}

function showMonthSelect() {
	var home = "JavaScript/";
	window.open(home, "win2702", "menubar=yes,scrollbars=yes,status=yes,toolbar=yes,resizable=yes,location=yes");
}
