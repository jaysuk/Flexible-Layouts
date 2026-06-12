/**
 * Tiny safe arithmetic-expression evaluator for the Value widget's display transform: `x` is the
 * live object-model value, e.g. "x / 60", "(x - 32) * 5 / 9". Supports + - * / parentheses and unary
 * minus only — a hand-rolled recursive descent so no eval()/Function() and nothing else is reachable.
 * Returns undefined for anything malformed rather than throwing (widgets render "—").
 */
export function evalMathExpr(expr: string, x: number): number | undefined {
	const s = expr.replace(/\s+/g, "");
	if (!s) {
		return undefined;
	}
	let pos = 0;

	function parseExpr(): number | undefined {
		let v = parseTerm();
		while (v !== undefined && (s[pos] === "+" || s[pos] === "-")) {
			const op = s[pos++];
			const r = parseTerm();
			if (r === undefined) {
				return undefined;
			}
			v = op === "+" ? v + r : v - r;
		}
		return v;
	}

	function parseTerm(): number | undefined {
		let v = parseUnary();
		while (v !== undefined && (s[pos] === "*" || s[pos] === "/")) {
			const op = s[pos++];
			const r = parseUnary();
			if (r === undefined) {
				return undefined;
			}
			v = op === "*" ? v * r : v / r;
		}
		return v;
	}

	function parseUnary(): number | undefined {
		if (s[pos] === "-") {
			pos++;
			const v = parseUnary();
			return v === undefined ? undefined : -v;
		}
		return parsePrimary();
	}

	function parsePrimary(): number | undefined {
		if (s[pos] === "(") {
			pos++;
			const v = parseExpr();
			if (v === undefined || s[pos] !== ")") {
				return undefined;
			}
			pos++;
			return v;
		}
		if (s[pos] === "x" || s[pos] === "X") {
			pos++;
			return x;
		}
		const m = /^\d+(\.\d+)?/.exec(s.slice(pos));
		if (m) {
			pos += m[0].length;
			return Number(m[0]);
		}
		return undefined;
	}

	const result = parseExpr();
	// Trailing garbage (e.g. "x..2", "x)") means the parse didn't consume everything: reject.
	return pos === s.length && result !== undefined && Number.isFinite(result) ? result : undefined;
}

/**
 * Normalise a BtnCmd "eval math" string into our `x`-based form: `#VAL`/`VAL` tokens become `x`, and
 * an operator-leading shorthand like "*2" or "/60" gets the implicit `x` prefixed. Returns undefined
 * when there's nothing usable.
 */
export function normalizeBtnCmdExpression(raw?: string): string | undefined {
	const e = (raw || "").trim();
	if (!e) {
		return undefined;
	}
	let out = e.replace(/#?VAL/gi, "x");
	if (/^[+\-*/]/.test(out)) {
		out = `x${out}`;
	}
	return /x/i.test(out) ? out : undefined;
}
