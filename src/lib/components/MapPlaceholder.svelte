<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	Placeholder hero visual: an abstract "map render" in the design language's
	treatment (dark ground, lime route, calm nodes). No subject-vendor imagery — the
	real product visual lands when the imagery pass runs.
-->
<svg
	viewBox="0 0 800 480"
	role="img"
	aria-label="Abstract map render placeholder: a route across a dark street grid"
	class="h-auto w-full"
>
	<defs>
		<radialGradient id="plume-glow" cx="30%" cy="20%" r="80%">
			<stop offset="0%" stop-color="#386fa4" stop-opacity="0.12" />
			<stop offset="60%" stop-color="#041302" stop-opacity="0" />
		</radialGradient>
	</defs>

	<rect width="800" height="480" fill="#171512" />
	<rect width="800" height="480" fill="url(#plume-glow)" />

	<!-- street grid -->
	<g stroke="#2a2722" stroke-width="2" fill="none">
		<path d="M0 90 H800 M0 200 H800 M0 310 H800 M0 400 H800" />
		<path d="M110 0 V480 M250 0 V480 M420 0 V480 M590 0 V480 M710 0 V480" />
		<path d="M0 145 Q220 120 420 165 T800 150" stroke="#33302a" />
	</g>

	<!-- blocks -->
	<g fill="#22201c">
		<rect x="130" y="110" width="100" height="70" rx="6" />
		<rect x="270" y="220" width="130" height="70" rx="6" />
		<rect x="610" y="330" width="80" height="50" rx="6" />
		<rect x="440" y="100" width="60" height="80" rx="6" />
	</g>

	<!-- route -->
	<path
		d="M110 400 L250 400 L250 200 L420 200 L420 90 L590 90 L590 330 L710 330"
		fill="none"
		stroke="#386fa4"
		stroke-width="4"
		stroke-linejoin="round"
		stroke-linecap="round"
	/>

	<!-- nodes -->
	<g>
		<circle cx="110" cy="400" r="9" fill="#386fa4" />
		<circle cx="420" cy="90" r="7" fill="#84d2f6" />
		<circle cx="590" cy="330" r="7" fill="#84d2f6" />
		<circle cx="710" cy="330" r="9" fill="#386fa4" />
	</g>

	<!-- sensor chips -->
	<g font-family="Arial, sans-serif" font-size="16" font-weight="700">
		<rect x="228" y="176" width="88" height="34" rx="17" fill="#33302b" />
		<text x="272" y="198" fill="#84d2f6" text-anchor="middle" letter-spacing="1"> CAM 041 </text>
		<rect x="548" y="356" width="88" height="34" rx="17" fill="#33302b" />
		<text x="592" y="378" fill="#84d2f6" text-anchor="middle" letter-spacing="1"> CAM 117 </text>
	</g>
</svg>
