/// <reference path="Utilities.ts" />
var ADDRESS_FIELD = 0x7F;
var FIELD_FIELD = 0x7000;
var INDIRECT_BIT = 0x400;
var LAST_PAGE_LOC = 0x7F;
var OP_CODE = 0xE00;
var PAGE_BIT = 0x80;
var PAGE_SIZE = 0x80;
var PAGE_FIELD = 0xF80;
var PAGE_ZERO_END = 0x80;
//
var startup_values = "\
    FIXMRI AND= 010000 / mainline instructions \n\
    FIXMRI TAD= 011000\n\
    FIXMRI ISZ= 012000\n\
    FIXMRI DCA= 013000\n\
    FIXMRI JMS= 014000\n\
    FIXMRI JMP= 015000\n\
    FIXMRI I=010400\n\
    FIXMRI Z= 010000\n\
    NOP= 007000 / group 1\n\
    CLA= 007200\n\
    CIA= 007041\n\
    CLL= 007100\n\
      CMA= 007040\n\
    CML= 007020\n\
    IAC= 007001\n\
    BSW= 007002\n\
    RAR= 007010\n\
    RAL= 007004\n\
    RTR= 007012\n\
    RTL= 007006\n\
    STA= 007240\n\
    STL= 007120\n\
    GLK= 007204\n\
    LAS= 007604\n\
\n\
\n\
    SMA= 007500 / group 2\n\
    SZA= 007440\n\
    SNL= 007420\n\
    SKP= 007410\n\
    SPA= 007510\n\
    SNA= 007450\n\
    SZL= 007430\n\
    OSR= 007404\n\
    HLT= 007402\n\
    KCC= 006032 / actually iots, but haven't fixed iots yet\n\
    KSF= 006031\n\
    KRS= 006034\n\
    KRB= 006036\n\
    IOT= 006000\n\
    ION= 006001\n\
    IOF= 006002\n\
    CDF= 006201\n\
    CIF= 006202\n\
    RDF= 006214\n\
    RIF= 006224\n\
    RIB= 006234\n\
    RMF= 006244\n\
    TSF= 006041\n\
    TCF= 006042\n\
    TPC= 006044\n\
    TLS= 006046\n\
    RSF= 006011\n\
    RRB= 006012\n\
    RFC= 006014\n\
    PSF= 006021\n\
    PCF= 006022\n\
    PPC= 006024\n\
    PLS= 006026\n";
//function octalfromint courtesy of Mark Arnold, (c) 1996
function octalfromint(i) {
    var d3 = Math.floor(i / 8 / 8 / 8) % 8;
    var d2 = Math.floor(i / 8 / 8) % 8;
    var d1 = Math.floor(i / 8) % 8;
    var d0 = i % 8;
    return ("" + d3 + d2 + d1 + d0);
}
function isblank(c) {
    return ((c == ' ') || (c == '\t') || (c == '\f') || (c == '>'));
}
function isend(c) {
    return ((c == '\0') || (c == '\n'));
}
function isdone(c) {
    return ((c == '/') || (isend(c)) || (c == ';'));
}
var s_detected = "detected";
var s_error = "error";
var s_errors = "errors";
var s_no = "No";
var s_page = "Page";
var s_symtable = "PDP8Symbol Table";
var s_xref = "Cross Reference";
var POOL_T = (function () {
    function POOL_T() {
        this.loc = PAGE_SIZE;
        for (var i = 0; i < PAGE_SIZE; i++)
            this[i] = 0;
    }
    POOL_T.prototype.insert = function (n) {
        var ix = PAGE_SIZE - 1;
        var loc = this.loc;
        while ((ix > loc) && (this[ix] != n))
            ix--;
        if (ix < loc) {
            this.loc--;
            this[loc] = n;
            ix = this.loc;
        }
        return ix;
    };
    POOL_T.prototype.clear = function () {
        this.loc = PAGE_SIZE;
    };
    return POOL_T;
}());
var EMSG_T = (function () {
    function EMSG_T() {
    }
    return EMSG_T;
}());
var ERRSAVE = (function () {
    function ERRSAVE() {
    }
    return ERRSAVE;
}());
/* Assembler diagnostic messages.                                             */
/* Some attempt has been made to keep continuity with the PAL-III and         */
/* MACRO-8 diagnostic messages.  If a diagnostic indicator, (e.g., IC)        */
/* exists, then the indicator is put in the listing as the first two          */
/* characters of the diagnostic message.  The PAL-III indicators where used   */
/* when there was a choice between using MACRO-8 and PAL-III indicators.      */
/* The character pairs and their meanings are:                                */
/*      DT  Duplicate Tag (PDP8Symbol)                                            */
/*      IC  Illegal Character                                                 */
/*      ID  Illegal Redefinition of a PDP8Symbol.  An attempt was made to give    */
/*          a PDP8Symbol a new value not via =.                                   */
/*      IE  Illegal Equals  An equal sign was used in the wrong context,      */
/*          (e.g., A+B=C, or TAD A+=B)                                        */
/*      II  Illegal Indirect  An off page reference was made, but a literal   */
/*          could not be generated because the indirect bit was already set.  */
/*      IR  Illegal Reference (address is not on current page or page zero)   */
/*      ND  No $ (the program terminator) at end of file.                     */
/*      PE  Current, Non-Zero Page Exceeded (literal table flowed into code)  */
/*      RD  ReDefintion of a PDP8Symbol                                           */
/*      ST  PDP8Symbol Table full                                                 */
/*      UA  Undefined Address (undefined PDP8Symbol)                              */
/*      ZE  Zero Page Exceeded (see above, or out of space)                   */
var duplicate_label = { list: "DT duplicate", file: "duplicate label" };
var illegal_blank = { list: "IC illegal blank", file: "illegal blank" };
var illegal_character = { list: "IC illegal char", file: "illegal character" };
var illegal_expression = { list: "IC in expression", file: "illegal expression" };
var label_syntax = { list: "IC label syntax", file: "label syntax" };
var not_a_number = { list: "IC numeric syntax", file: "numeric syntax of" };
var number_not_radix = { list: "IC radix", file: "number not in current radix" };
var symbol_syntax = { list: "IC PDP8Symbol syntax", file: "PDP8Symbol syntax" };
var illegal_equals = { list: "IE illegal =", file: "illegal equals" };
var illegal_indirect = { list: "II off page", file: "illegal indirect" };
var illegal_reference = { list: "IR off page", file: "illegal reference" };
var undefined_symbol = { list: "UD undefined", file: "undefined PDP8Symbol" };
var redefined_symbol = { list: "RD redefined", file: "redefined PDP8Symbol" };
var literal_overflow = { list: "PE page exceeded", file: "current page literal capacity exceeded" };
var pz_literal_overflow = { list: "ZE page exceeded", file: "page zero capacity exceeded" };
var dubl_overflow = { list: "dubl overflow", file: "DUBL value overflow" };
var fltg_overflow = { list: "fltg overflow", file: "FLTG value overflow" };
var zblock_too_small = { list: "expr too small", file: "ZBLOCK value too small" };
var zblock_too_large = { list: "expr too large", file: "ZBLOCK value too large" };
var end_of_file = { list: "ND no $ at EOF", file: "No $ at End-of-File" };
var no_pseudo_op = { list: "not implemented", file: "not implemented pseudo-op" };
var illegal_field_value = { list: "expr out of range", file: "field value not in range of 0 through 7" };
var literal_gen_off = { list: "literals off", file: "literal generation is off" };
var no_literal_value = { list: "no value", file: "no literal value" };
var text_string = { list: "no delimiter", file: "text string delimiters not matched" };
var in_rim_mode = { list: "not OK in rim mode", file: "FIELD pseudo-op not valid in RIM mode" };
var lt_expected = { list: "'<' expected", file: "'<' expected" };
var symbol_table_full = { list: "ST PDP8Symbol Tbl Full", file: "PDP8Symbol Table Full" };
/// This formats an octol number with leading zeros
function isWhitespace(character) {
    return ['\n', '\r', '\t', ' ', ','].indexOf(character) !== -1;
}
function validLabel(label) {
    return /^[a-zA-Z0-9_]+$/.test(label);
}
// The constant type is mainly used for expression parsing  constant value
var Kind;
(function (Kind) {
    Kind[Kind["Undefined"] = 0] = "Undefined";
    Kind[Kind["Defined"] = 1] = "Defined";
    Kind[Kind["Label"] = 2] = "Label";
    Kind[Kind["Fixed"] = 3] = "Fixed";
    Kind[Kind["Constant"] = 4] = "Constant";
    Kind[Kind["Pseudo"] = 5] = "Pseudo";
})(Kind || (Kind = {}));
;
var LineStyle;
(function (LineStyle) {
    LineStyle[LineStyle["Line"] = 0] = "Line";
    LineStyle[LineStyle["LineVal"] = 1] = "LineVal";
    LineStyle[LineStyle["LineLocVal"] = 2] = "LineLocVal";
    LineStyle[LineStyle["LocVal"] = 3] = "LocVal";
})(LineStyle || (LineStyle = {}));
;
;
var PDP8Symbol = (function () {
    function PDP8Symbol(name, value, fixed, mri) {
        this.lineno = -1;
        this.mri = mri || false;
        this.xreftab = [];
        if (typeof name === "string") {
            this.name = name;
            if (typeof value === "function") {
                this.value = 0;
                this.kind = Kind.Pseudo;
                this.pseudo = value;
            }
            else {
                this.value = typeof value === "number" ? value : 0;
                this.kind = fixed ? Kind.Fixed : Kind.Undefined;
            }
        }
        else if (typeof name === "number") {
            this.name = null;
            this.value = value;
            this.kind = Kind.Constant;
        }
        else
            throw "Bad PDP8Symbol constructor value : " + value;
    }
    PDP8Symbol.prototype.mathOp = function (op, right) {
        var sym = this.kind == Kind.Constant ? this : new PDP8Symbol(this.value);
        sym.mri = this.mri || right.mri || undefined;
        switch (op) {
            case '+':
                sym.value += right.value;
                break;
            case '-':
        }
    };
    PDP8Symbol.prototype.expunge = function () {
        if (this.kind == Kind.Fixed || this.kind == Kind.Pseudo)
            return;
        this.kind = Kind.Undefined;
        this.redefined = undefined;
        this.duplicate = false;
        this.condition = false;
        this.lineno = 0;
        this.xreftab = [];
    };
    PDP8Symbol.prototype.xrefs = function () {
        var str = "";
        if (this.kind == Kind.Undefined)
            str = " U         ";
        else if (this.redefined)
            str = " M  " + this.redefined.toString().rightJustify(5) + "  ";
        else
            str = " A  " + this.lineno.toString().rightJustify(5) + "  ";
        str += this.name.leftJustify(6, 6) + "  ";
        for (var xc = 0; xc < this.xreftab.length; xc++) {
            var val = this.xreftab[xc];
            str += val.toString().leftJustify(5);
        }
        return str;
    };
    return PDP8Symbol;
}());
;
// It just has mri, value and name so be sure to set them all to fixed
// Much easyer than doing it over and over again in passes
var Token = (function () {
    function Token(value, pos, text) {
        this.value = value;
        this.text = text || undefined;
        this.pos = pos || 0;
    }
    return Token;
}());
var PDP8Lexer = (function () {
    function PDP8Lexer(text) {
        this._process = function (func, t) {
            var endpos = this.pos + 1;
            while (endpos < this.text.length && func(this.text.charAt(endpos)))
                endpos++;
            var tok = new Token(t, this.pos, this.text.substring(this.pos, endpos).toUpperCase());
            this.pos = endpos;
            return tok;
        };
        this.text = text;
        this.pos = 0;
        var tokens = [];
        var tok;
        do {
            tok = this._token();
            tokens.push(tok);
        } while (tok.value != '\n');
        this.tokens = tokens;
    }
    PDP8Lexer._isdigit = function (c) {
        return c >= '0' && c <= '9';
    };
    PDP8Lexer._isalpha = function (c) {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            c === '_';
    };
    PDP8Lexer._isalphanum = function (c) {
        return (c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') ||
            c === '_';
    };
    PDP8Lexer.prototype._skipnontokens = function () {
        while (this.pos < this.text.length) {
            var c = this.text.charAt(this.pos);
            if (c == ' ' || c == '\t' || c == '\r' || c == '\n')
                this.pos++;
            else
                break;
        }
    };
    PDP8Lexer.prototype._token = function () {
        this._skipnontokens();
        if (this.pos >= this.text.length)
            return new Token('\n', this.text.length - 1);
        var c = this.text.charAt(this.pos);
        if (c == '/')
            return new Token('\n', this.pos); // comment
        else if (PDP8Lexer._isalpha(c))
            return this._process(PDP8Lexer._isalphanum, "PDP8Symbol");
        else if (PDP8Lexer._isdigit(c))
            return this._process(PDP8Lexer._isdigit, "NUMBER");
        else {
            var tok = new Token(c, this.pos);
            this.pos++;
            return tok;
        }
    };
    return PDP8Lexer;
}());
var ExpressionError = (function () {
    function ExpressionError(error, token) {
        this.error = error;
        this.token = token;
    }
    return ExpressionError;
}());
;
var AST = (function () {
    function AST(op, left, right) {
        if (typeof op === "number") {
            this.value = op;
            this.op = "NUMBER";
        }
        else if (typeof op == "string") {
            this.op = op;
            if (left) {
                if (typeof left === "number")
                    this.value = left;
                else
                    this.left = left;
            }
            if (right)
                this.right = right;
        }
        else {
            this.PDP8Symbol = op;
            this.value = op.value;
            this.op = "PDP8Symbol";
        }
    }
    AST.prototype.isMRI = function () {
        var ret;
        if (this.op == "PDP8Symbol")
            return this.PDP8Symbol.mri === undefined ? false : this.PDP8Symbol.mri;
        else if (this.left && this.left.isMRI())
            return true;
        else if (this.right && this.right.isMRI())
            return true;
        else
            return false;
    };
    AST.prototype.walk = function () {
        var value = this.left ? this.left.walk() : 0;
        switch (this.op) {
            case '.':
                return this.value;
            case '+':
                if (this.right)
                    value += this.right.walk();
                break;
            case '-':
                if (this.right)
                    value -= this.right.walk();
                else
                    value = -value;
                break;
            case '|':
                value |= this.right.walk();
                break;
            case "NUMBER":
                return this.value;
            case "PDP8Symbol":
                var kind = this.PDP8Symbol.kind;
                switch (kind) {
                    case Kind.Defined:
                    case Kind.Fixed:
                        value = this.PDP8Symbol.value;
                        break;
                    default:
                        value = NaN; // undefined PDP8Symbol
                        break;
                }
        }
        return NaN;
    };
    return AST;
}());
var BinData = (function () {
    function BinData(loc, data) {
        this.loc = loc;
        this.data = data;
    }
    return BinData;
}());
var TokenLine = (function () {
    function TokenLine(line, lineno) {
        var lex = new PDP8Lexer(line);
        this.lineno = lineno || -1;
        this.line = line;
        this.tokens = lex.tokens;
        this.loc = -1; // current loc
        this.data = [];
    }
    TokenLine.prototype.putOut = function (loc, data) {
        if (loc < 0 && data < 0)
            return; // don't add if both are negitive
        if (loc >= 0 && this.loc == -1)
            this.loc = loc;
        this.data.push(new BinData(loc, data));
    };
    TokenLine.prototype.list = function () {
        var num;
        var str = this.lineno != -1 ? this.lineno.toString().leftJustify(5) + " " : "      ";
        str += (this.data.length > 0) && this.data[0].loc < 0 ? "      " : this.data[0].loc.toString(8).leftJustify(5, 5) + " "; // if we have a staring location.
        str += (this.data.length > 0) && this.data[0].data < 0 ? "    " : this.data[0].data.toString(8).leftJustify(4, 4) + " "; // if we have a location
        str += " "; /// figure a way for indirect?  Mabye a flag?
        str += this.line;
        if (this.error_message) {
            str += '\n';
            var msg = this.error_message.leftJustify(18, 18);
            if (this.error_pos >= 0) {
                var pos = this.error_pos;
                for (var i = 0; i < pos; i++)
                    if (this.line.charAt(i) == '\t')
                        msg += '\t';
                    else
                        msg += ' ';
                msg += '^';
                str += msg;
            }
        } //else str += this.line;
        str += '\n';
        if (this.data.length > 1) {
            for (var i = 1; i < this.data.length; i++) {
                str += "      ";
                str += this.data[0].loc < 0 ? "      " : this.data[0].loc.toString(8).leftJustify(5, 5) + " "; // if we have a staring location.
                str += this.data[0].data < 0 ? "    " : this.data[0].data.toString(8).leftJustify(4, 4) + " "; // if we have a location
            }
        }
        return str;
    };
    return TokenLine;
}());
var PDP8Assembler = (function () {
    function PDP8Assembler(text) {
        this.linesToOrg = {};
        this.source = null;
        this.pass = 1;
        this.pos = 0;
        this.lineno = 0;
        this.line = null;
        this.lines = [];
        // var linesText: string[] = text.split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/); // This should cover eveything..  One can hope:P
        //  for (var i = 0; i < linesText.length; i++) this.lines.push(new TokenLine(linesText[i]));
        //  this.literals = [];
        //   for (var i = 0; i < 32; i++) this.literals[i] = new POOL_T();
        //this.cp_literals = new POOL_T();
        // this.pz_literals = new POOL_T();
        // PDP8Symbol table defines
        this.symtab = {};
        this.make_pseudo("DECIMAL", function (self) { self.base = 10; });
        this.make_pseudo("OCTAL", function (self) { self.base = 8; });
        this.make_pseudo("ZBLOCK", function (self) {
            var token = self.token;
            var val = self.getexpr().walk();
            if (val < 0)
                self.error(zblock_too_small, token.pos);
            else if (val + this.clc - 1 > 0xFFF)
                self.error(zblock_too_large, token.pos);
            else {
                for (; val > 0; val--)
                    self.putout(this.clc, 0);
                this.clc++;
            }
        });
        this.make_pseudo("PAGE", function (self) {
            //   self.putcp(); // christ almighty, this will give some programers tears
            if (self.isdone()) {
                self.clc = (self.clc & 0xF80) + 0x80;
            }
            else {
                var val = this.getexpr();
                self.clc = (val & 0x1F) << 7;
            }
            if (!self.rimflag)
                self.putorg(this.clc);
        });
        this.make_pseudo("RELOC", function (self) {
            if (self.isdone()) {
                self.reloc = 0;
            }
            else {
                var val = this.getexpr();
                this.reloc = val - (this.clc + this.reloc);
            }
        });
        this.make_pseudo("FIXMRI", function (self) {
            var token = self.token;
            if (token.value == "PDP8Symbol") {
                self.readToken();
                if (self.token.value == '=') {
                    self.readToken();
                    //sym.value = self.getexprs();
                    //  var sym = self.defineSymbol(token, self.getexprs(), false);
                    //sym.mri = true;
                    // sym.kind = Kind.Fixed;
                    return;
                }
            }
            self.error(symbol_syntax, token.pos, token.text);
            while (!self.isdone())
                self.readToken();
        });
        // test and set up inital table
        this.asemble(startup_values);
    }
    PDP8Assembler.prototype.currentLine = function () { return this.line.line; };
    PDP8Assembler.prototype.isdone = function () {
        return this.token.value == '\n' || this.token.value == ';';
    };
    PDP8Assembler.prototype.putorg = function (loc) {
        if (this.line.loc == -1)
            this.line.loc = loc;
        else if (this.line.loc == loc)
            return;
        else {
        }
    };
    PDP8Assembler.prototype.putout = function (loc, val) {
        if (loc == NaN || val == NaN) {
            if (this.pass > 1)
                throw "Bad Put Out";
        }
        this.line.putOut(loc, val);
    };
    PDP8Assembler.prototype.punchLiteralPool = function (p, page) {
        page &= PAGE_FIELD;
        if (p.loc < PAGE_SIZE) {
            for (var loc = p.loc; loc < PAGE_SIZE; loc++) {
                var templc = loc + page;
                this.putout(templc, p[loc]); // it should work
            }
            p.clear();
        }
    };
    PDP8Assembler.prototype.insertLiteral = function (p, value) {
        /* If page zero is the current page, make sure that literals are inserted   */
        /* in the page zero literal table.                                          */
        if ((this.clc & PAGE_FIELD) == 0)
            p = this.pz;
        return p.insert(value);
    };
    PDP8Assembler.prototype.incrmentClc = function () {
        this.testForLiteralCollision(this.clc);
        var clc = ((this.clc + 1) & 0xFFF);
        this.clc = (this.clc & 0x7000) | clc;
        this.fieldlc = clc;
        return this.clc;
    };
    PDP8Assembler.prototype.testForLiteralCollision = function (loc) {
        var tmppage = loc & PAGE_FIELD;
        var pagelc = loc & (PAGE_SIZE - 1);
        if (tmppage == 0) {
            if (pagelc >= this.pz.loc) {
                this.error(pz_literal_overflow, -1);
                return true;
            }
        }
        else {
            if (pagelc >= this.cp.loc) {
                this.error(literal_overflow, -1);
                return true;
            }
        }
        return false;
    };
    PDP8Assembler.prototype.error = function (msg, col, name) {
        if (this.errorfile !== undefined && typeof this.errorfile === "string") {
            var linecol = "(" + this.line.lineno + ":" + col + ")";
            this.errorfile += linecol.leftJustify(9) + " : error:  " + msg.file;
            if (name !== undefined)
                this.errorfile += " \"" + name + "\";";
            this.errorfile += " at Loc = " + this.clc.toString(8).leftJustify(5, 5) + "\n";
            this.line.error_message = msg.list;
            this.line.error_pos = col;
            this.errors++;
        }
    };
    /// read one input line, setting things up for lexical analysis 
    PDP8Assembler.prototype.nextLine = function () {
        this.pos = 0;
        if (this.lineno >= this.lines.length)
            this.line = PDP8Assembler._end_of_file; // fake end of pal file
        else
            this.line = this.lines[this.lineno++];
        this.readToken(); // make sure the token is valid
    };
    PDP8Assembler.prototype.readToken = function () {
        if (this.savedtoken !== undefined && this.savedtoken != null) {
            this.token = this.savedtoken;
            this.savedtoken = null;
            return this.token;
        }
        else if (this.pos < this.line.tokens.length)
            this.token = this.line.tokens[this.pos++];
        return this.token;
    };
    PDP8Assembler.prototype.peekToken = function () {
        if (this.savedtoken !== undefined && this.savedtoken != null) {
            return this.savedtoken;
        }
        else if (this.pos < this.line.tokens.length)
            return this.line.tokens[this.pos];
        else
            return undefined;
    };
    PDP8Assembler.prototype.saveToken = function (tok) {
        this.savedtoken = tok;
    };
    PDP8Assembler.prototype.lookup = function (name) {
        var sym = this.symtab[name];
        if (sym !== undefined)
            return sym;
        else
            return (this.symtab[name] = sym = new PDP8Symbol(name)); // constructor handles this
    };
    PDP8Assembler.prototype.printCrossRefrences = function () {
        var str = "";
        var cols = 0;
        for (var key in this.symtab) {
            if (!this.symtab.hasOwnProperty(key))
                continue; // There isn't a fancy typescrypt way of doing this?
            var sym = this.symtab[key];
            str += sym.xrefs() + "n";
        }
        return str;
    };
    PDP8Assembler.prototype.defineSymbol = function (token, value, isLabel) {
        var sym = this.lookup(token.text);
        if (sym.kind == Kind.Fixed)
            return sym; // can't modify permanet symbols
        if (sym.kind != Kind.Undefined) {
            if (this.pass == 2 && sym.value != value) {
                if (sym.redefined)
                    this.error(redefined_symbol, token.pos, sym.name);
                sym.redefined = this.line.lineno;
                sym.xreftab.push(this.line.lineno);
            }
        }
        else if (this.pass == 2) {
            sym.lineno = this.line.lineno;
        }
        sym.value = isLabel ? value : value & 0xFFF;
        sym.kind = isLabel ? Kind.Label : Kind.Defined;
        sym.condition = this.pass == 1 ? true : false;
        return sym;
    };
    // not sure if this is the best way to handle this but it gets away from having to create a new object
    // for expression trees.  If I can avoid the AST and just use the token stream save a few seconds.
    // me things I am over optimizing:P
    PDP8Assembler.prototype.evalSymbol = function (token) {
        var sym = this.lookup(token.text);
        if (this.pass == 2)
            sym.xreftab.push(this.line.lineno);
        return sym;
    };
    PDP8Assembler.prototype.getexprs = function () {
        var curtok = this.token;
        var ast = this.getexpr();
        for (;;) {
            switch (this.token.value) {
                case '\n':
                case ')':
                case ']':
                    return ast;
                default:
                    var temp = this.getexpr();
                    if ((ast.op == "PDP8Symbol" || ast.op == "NUMBER") && (temp.op == "PDP8Symbol" || temp.op == "NUMBER"))
                        ast = new AST('|', ast, temp);
                    else
                        throw new ExpressionError(illegal_expression, curtok);
            }
        }
    };
    PDP8Assembler.prototype.getexpr = function () {
        var num;
        if (this.token.value == '-') {
            this.readToken();
            num = new AST('-', this.eval());
        }
        else
            num = this.eval();
        for (;;) {
            switch (this.token.value) {
                case '+':
                    this.readToken();
                    num = new AST('+', num, this.eval());
                    break;
                case '-':
                    this.readToken();
                    num = new AST('-', num, this.eval());
                    break;
                case ';':
                case ')':
                case ']':
                case '<':
                case '\n':
                    return num; // just return
                default:
                    throw new ExpressionError(illegal_expression, this.token);
            }
        }
    };
    PDP8Assembler.prototype.eval = function () {
        var curtok = this.token;
        var num = 0;
        switch (curtok.value) {
            case 'NUMBER':
                this.readToken();
                return new AST(parseInt(curtok.text, this.base));
            case 'PDP8Symbol':
                this.readToken();
                var sym = this.evalSymbol(curtok);
                return new AST(sym);
            case '.':
                this.readToken();
                return new AST('.');
            case '(':
                // if ((this.clc & 0xF80) == 0) this.error("page zero");
                this.readToken(); // skip bracket
                var ast = new AST("ZPAGE", this.getexpr());
                if (this.token.value == ')')
                    this.readToken(); // skip it
                return ast;
            case '[':
                this.readToken(); // skip bracket
                var ast = new AST("CPAGE", this.getexpr());
                if (this.token.value == ']')
                    this.readToken(); // skip it
                return ast;
            default:
                throw new ExpressionError(illegal_expression, curtok);
        }
    };
    PDP8Assembler.prototype.asgmnt = function () {
        var curtok = this.token;
        if (curtok.value != "PDP8Symbol")
            return this.getexprs();
        var sym = this.lookup(curtok.text);
        if (sym.kind == Kind.Pseudo) {
            this.readToken(); // skipit
            if (this.pass == 2)
                return null; // don't worry about it in pass 2 
            if (sym.pseudo === undefined || typeof sym.pseudo !== "function")
                this.error(no_pseudo_op, curtok.pos, curtok.text);
            else
                return sym.pseudo(this); // we could put the function in the PDP8Symbol I guess, go javascript?
        }
        else {
            var nextToken = this.peekToken();
            if (nextToken.value == ',') {
                this.readToken(); // consume PDP8Symbol
                this.readToken(); // consume ','
                if (this.pass == 1 && sym.kind != Kind.Undefined)
                    throw new ExpressionError(redefined_symbol, curtok); // redefined PDP8Symbol
                this.defineSymbol(curtok, (this.clc + this.reloc) & 0xFFF, true);
                return null;
            }
            else if (nextToken.value == '=') {
                this.readToken(); // consume PDP8Symbol
                this.readToken(); // consume '='
                if (this.pass == 1 && sym.kind != Kind.Undefined)
                    throw new ExpressionError(redefined_symbol, curtok); // redefined PDP8Symbol
                this.defineSymbol(curtok, this.getexprs().walk(), false);
                return null;
            }
            else
                return this.getexprs();
        }
    };
    PDP8Assembler.prototype.onepass = function () {
        this.clc = 0;
        this.reloc = 0;
        this.field = 0;
        this.cp.clear();
        this.pz.clear();
        this.base = 8;
        this.listed = "filler";
        this.lineno = 0;
        this.nextLine();
        var root = null;
        var next = null; // current ast
        for (;;) {
            var curtok = this.token;
            switch (this.token.value) {
                case '\n':
                    this.nextLine();
                    continue;
                case ';':
                    this.readToken();
                    //pushAst(new AST(';'));
                    continue; // token in same statement
                case '$':
                    return; // all done
                case '*':
                    this.readToken(); // skip over token
                    var newlc = (this.getexpr().walk() & 0xFFF) | this.field;
                    if (newlc == NaN)
                        throw new ExpressionError(illegal_expression, curtok); // expected const expression
                    if ((newlc & 0xF80) != (this.clc & 0xF80))
                        this.punchLiteralPool(this.cp, this.clc - 1); // we changed pages...  damnit this is a bug, it overwrites here sigh
                    this.clc = newlc - this.reloc;
                    this.fieldlc = this.clc & 0xFFF;
                    this.putout(this.clc, -1);
                    break;
                default:
                    var ast = this.asgmnt();
                    if (ast == null)
                        continue;
                    if (ast == undefined)
                        throw new ExpressionError(illegal_expression, curtok); // expected expression
                    var val = ast.walk();
                    if (val == NaN && this.pass == 2) {
                        throw new ExpressionError(illegal_expression, curtok); // expected expression
                    }
                    else
                        this.putout(this.clc, val);
                    this.incrmentClc();
                    continue;
            }
        }
    };
    PDP8Assembler.prototype.make_pseudo = function (name, func) {
        var sym = this.lookup(name);
        if (sym.kind == Kind.Undefined || (sym.kind == Kind.Pseudo && sym.pseudo === undefined)) {
            //sym.pseudo = func;
            sym.kind = Kind.Pseudo;
        }
        else
            throw "Pseudo function already defined";
    };
    PDP8Assembler.prototype.asemble = function (text) {
        if (text !== undefined && this.source != text) {
            this.source = text;
            var linesText = text.split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/); // This should cover eveything..  One can hope:P
            for (var i = 0; i < linesText.length; i++)
                this.lines.push(new TokenLine(linesText[i], i + 1));
            this.errorfile = undefined;
            this.onepass();
            this.errorfile = "";
            this.onepass();
            var str = "";
            for (var i = 0; i < this.lines.length; i++)
                str += this.lines[i].list();
            this.listfile = str;
            console.log("Assembled");
        }
        return this.listfile;
    };
    PDP8Assembler._end_of_file = new TokenLine("$");
    return PDP8Assembler;
}());
//# sourceMappingURL=pdp8asm.js.map