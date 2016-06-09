// What the fuck?
var HexRecord = (function () {
    function HexRecord(line) {
        if (line.length < 11 || line[0] != ':')
            throw "Missing collon";
        var pos = 1;
        var chk = 0;
        this.data = [];
        function nextByte() { var num = parseInt(line.substr(pos, 2), 16); pos += 2; chk += num & 0xFF; return num; }
        this.count = nextByte();
        this.addr = nextByte() << 8;
        this.addr |= nextByte();
        this.recType = nextByte();
        for (var i = 0; i < this.count; i++)
            this.data.push(nextByte());
        var fchk = nextByte();
        chk &= 0xFF;
        if (pos < line.length)
            throw "Bad End of line";
        if (chk != 0)
            throw "Bad Checksum";
        this.chksum = fchk;
    }
    HexRecord.prototype.formatHex = function (val, digits) {
        var str = val.toString(16).toUpperCase();
        while (str.length < digits)
            str = '0' + str;
        return str;
    };
    HexRecord.prototype.isEqual = function (o) {
        if (this.recType != o.recType)
            return false;
        if (this.count != o.count)
            return false;
        if (this.addr != o.addr)
            return false;
        for (var i = 0; i < this.count; i++)
            if (this.data[i] != o.data[i])
                return false;
        return true;
    };
    HexRecord.prototype.toString = function () {
        var str = ":";
        var chk = 0;
        var val = 0;
        chk += this.count;
        str += this.formatHex(this.count, 2);
        chk += this.addr;
        str += this.formatHex(this.addr, 4);
        chk += this.recType;
        str += this.formatHex(this.recType, 2);
        for (var i = 0; i < this.count; i++) {
            var val = this.data[i];
            chk += val;
            str += this.formatHex(val, 2);
        }
        var ichk = ((~chk & 0xFF) + 1) & 0xFF;
        str += this.formatHex(ichk, 2);
        return str;
    };
    return HexRecord;
}());
var IHEXFILE = (function () {
    function IHEXFILE() {
        this.clear();
    }
    IHEXFILE.prototype.clear = function () {
        this.text = "";
        this.B = [];
        this.W = [];
        this.R = [];
        for (var i = 0; i < 0x10000; i++)
            this.B[i] = this.W[i] = -1;
    };
    IHEXFILE.prototype.error = function (msg) {
        if (this.debug)
            this.debug(msg);
        else {
            alert(msg);
        }
    };
    IHEXFILE.prototype.process = function (text, wordSwap) {
        wordSwap = wordSwap || false;
        var R = this.R;
        this.clear();
        var error = this.error;
        this.text = text;
        var addru = 0;
        var addrl = 0;
        var lines = text.split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/); // This should cover eveything..  One can hope:P
        var line = "";
        var lineno = 0;
        for (lineno = 0; lineno < lines.length; lineno++) {
            line = lines[lineno].trim();
            if (line.length < 11 || line[0] != ':')
                throw "Bad Line at " + i;
            var data = new HexRecord(line);
            switch (data.recType) {
                case 0:
                    var addr = data.addr + (addrl | (addru << 16)); // add the segment if I ever get around to setting it up
                    var last;
                    if (data.count != data.data.length)
                        error("Somethings wrong");
                    for (var i = 0; i < data.count; i++) {
                        var d = data.data[i];
                        if (d === undefined || d == NaN || d < 0 || d > 0xFF)
                            error("Somethings wrong");
                        var nadd = addr + i;
                        this.B[nadd] = d;
                        if (nadd & 1)
                            this.W[nadd >> 1] = wordSwap ? (last | (d << 8)) : (d | (last << 8));
                        last = d;
                    }
                    break;
                case 1:
                    if (data.count != 0)
                        error("Extra Data at end of file at line " + i);
                    return; // we are done!
                case 2:
                case 3:
                    error("Segments not supported, cause I am lazy");
                    break;
                case 4:
                    if (data.count != 2)
                        error("Extended Linear Address must have a byte count of 2");
                    addru = data.data[0] << 8 | data.data[1];
                    break;
                case 5:
                    error("Not many cpus support EIP do they?  Why do we use this format again?");
                    break;
                default:
                    error("Bad Rec type at line " + i);
                    break;
            }
        }
        error("No end of file found");
    };
    return IHEXFILE;
}());
var DISMUtil;
(function (DISMUtil) {
    var operandToReg = [];
    operandToReg[0x00] = "INDF0";
    operandToReg[0x01] = "INDF1";
    operandToReg[0x02] = "PCL";
    operandToReg[0x03] = "STATUS";
    operandToReg[0x04] = "FSR0L";
    operandToReg[0x05] = "FSR0H";
    operandToReg[0x06] = "FSR1L";
    operandToReg[0x07] = "FSR1H";
    operandToReg[0x08] = "BSR";
    operandToReg[0x09] = "WREG";
    operandToReg[0x0A] = "PCLATH";
    operandToReg[0x0B] = "INTCON";
    var bank = [];
    bank[0] = [];
    bank[0][0x0C] = "PORTA";
    bank[0][0x0D] = "PORTB";
    bank[0][0x0E] = "PORTC";
    bank[0][0x0F] = "PORTD";
    bank[0][0x10] = "PORTE";
    bank[0][0x11] = "PIR1";
    bank[0][0x12] = "PIR2";
    bank[0][0x13] = "PIR3";
    bank[0][0x15] = "TMR0";
    bank[0][0x16] = "TMR1L";
    bank[0][0x17] = "TMR1H";
    bank[0][0x18] = "T1CON";
    bank[0][0x19] = "T1GCON";
    bank[0][0x1A] = "TMR2";
    bank[0][0x1B] = "PR2";
    bank[0][0x1C] = "TxCON";
    bank[0][0x1E] = "CPSCON0";
    bank[0][0x1F] = "CPSCON1";
    bank[1] = [];
    bank[1][0x0C] = "TRISA";
    bank[1][0x0D] = "TRISB";
    bank[1][0x0E] = "TRISC";
    bank[1][0x0F] = "TRISD";
    bank[1][0x10] = "TRISE";
    bank[1][0x11] = "PIE1";
    bank[1][0x12] = "PIE2";
    bank[1][0x13] = "PIE3";
    bank[1][0x15] = "OPTION";
    bank[1][0x16] = "PCON";
    bank[1][0x17] = "WDTCON";
    bank[1][0x18] = "OSCTUNE";
    bank[1][0x19] = "OSCCON";
    bank[1][0x1A] = "OSCSTAT";
    bank[1][0x1B] = "ADRESL";
    bank[1][0x1C] = "ADRESH";
    bank[1][0x1D] = "ADCON0";
    bank[1][0x1E] = "ADCON1";
    bank[2] = [];
    bank[2][0x0C] = "LATA";
    bank[2][0x0D] = "LATB";
    bank[2][0x0E] = "LATC";
    bank[2][0x0F] = "LATD";
    bank[2][0x10] = "LATE";
    bank[2][0x11] = "CM1CON0";
    bank[2][0x12] = "CM1CON1";
    bank[2][0x13] = "CM2CON0";
    bank[2][0x14] = "CM2CON1";
    bank[2][0x15] = "CMOUT";
    bank[2][0x16] = "BORCON";
    bank[2][0x17] = "FVRCON";
    bank[2][0x18] = "DACCON0";
    bank[2][0x19] = "DACCON1";
    bank[2][0x1A] = "SRCON0";
    bank[2][0x1B] = "SRCON1";
    bank[2][0x1D] = "APFCON";
    bank[3] = [];
    bank[3][0x0C] = "ANSELA";
    bank[3][0x0D] = "ANSELB";
    bank[3][0x0F] = "ANSELD";
    bank[3][0x10] = "ANSELE";
    bank[3][0x11] = "EEADRL";
    bank[3][0x12] = "EEADRH";
    bank[3][0x13] = "EEDATL";
    bank[3][0x14] = "EEDATH";
    bank[3][0x15] = "EECON1";
    bank[3][0x16] = "EECON2";
    bank[3][0x19] = "RCREG";
    bank[3][0x1A] = "TXREG";
    bank[3][0x1B] = "SPBRGL";
    bank[3][0x1C] = "SPBRGH";
    bank[3][0x1D] = "RCSTA";
    bank[3][0x1E] = "TXSTA";
    bank[3][0x1F] = "BAUDCTR";
    bank[4] = [];
    bank[4][0x0D] = "WPUB";
    bank[4][0x10] = "WPUE";
    bank[4][0x11] = "SSPxBUF";
    bank[4][0x12] = "SSPxADD";
    bank[4][0x13] = "SSPxMSK";
    bank[4][0x14] = "SSPxSTAT";
    bank[4][0x15] = "SSPxCON1";
    bank[4][0x16] = "SSPxCON2";
    bank[4][0x17] = "SSPxCON3";
    bank[5] = [];
    bank[5][0x11] = "CCPR1L";
    bank[5][0x12] = "CCPR1H";
    bank[5][0x13] = "CCP1CON";
    bank[5][0x14] = "PWM1CON";
    bank[5][0x15] = "CCP1AS";
    bank[5][0x16] = "PSTR1CON";
    bank[5][0x18] = "CCPR2L";
    bank[5][0x19] = "CCPR2H";
    bank[5][0x1A] = "CCP2CON";
    bank[5][0x1B] = "PWM2CON";
    bank[5][0x1C] = "CCP2AS";
    bank[5][0x1D] = "PSTR2CON";
    bank[5][0x1E] = "CCPTMRS0";
    bank[5][0x1F] = "CCPTMRS1";
    bank[6] = [];
    bank[6][0x11] = "CCPR3L";
    bank[6][0x12] = "CCPR3H";
    bank[6][0x13] = "CCP3CON";
    bank[6][0x14] = "PWM3CON";
    bank[6][0x15] = "CCP3AS";
    bank[6][0x16] = "PSTR3CON";
    bank[6][0x18] = "CCPR4L";
    bank[6][0x19] = "CCPR4H";
    bank[6][0x1A] = "CCP4CON";
    bank[6][0x1C] = "CCPR5L";
    bank[6][0x1D] = "CCPR5H";
    bank[6][0x1E] = "CCP5CON";
    bank[7] = [];
    bank[7][0x14] = "IOCBP";
    bank[7][0x15] = "IOCBN";
    bank[7][0x16] = "IOCBF";
    bank[8] = [];
    bank[8][0x15] = "TMR4";
    bank[8][0x16] = "PR4";
    bank[8][0x17] = "T4CON";
    bank[8][0x1C] = "TMR6";
    bank[8][0x1D] = "PR6";
    bank[8][0x1E] = "T6CON";
    function formatReg(reg, bankno) {
        var reg_name;
        if (reg < 0xC)
            reg_name = operandToReg[reg];
        else if (bankno !== undefined) {
            reg_name = bank[bankno][reg];
        }
        return reg_name === undefined || reg_name == null || reg_name.length == 0 ? '0x' + this.hexFormat(reg) : reg_name;
    }
    DISMUtil.formatReg = formatReg;
    function hexFormat(val, bytes) {
        var s = "";
        if (bytes === undefined || bytes == 1) {
            val &= 0xFF;
            if (val <= 0xF)
                s += '0';
        }
        else if (bytes == 2) {
            val &= 0xFFFF;
            if (val <= 0xF)
                s += '000';
            else if (val <= 0xFF)
                s += '00';
            else if (val <= 0xFFF)
                s += '0';
        }
        else
            throw "SHOULDN";
        return s + val.toString(16).toUpperCase();
    }
    DISMUtil.hexFormat = hexFormat;
    var _leftJustifyCache = []; // use this alot so thought lookups be faster than rebuilding an array and join
    function leftJustify(s, length) {
        var len = length - s.length;
        if (len <= 0)
            return s;
        var fills = _leftJustifyCache[len];
        if (fills === undefined) {
            var fill = [];
            while (fill.length + s.length < length)
                fill[fill.length] = ' ';
            fills = fill.join('');
            _leftJustifyCache[len] = fills;
        }
        return s + fills;
    }
    DISMUtil.leftJustify = leftJustify;
    function formatByte(val) {
        var str = (val & 0xFF).toString(16);
        if (str.length == 1)
            str = '0x0' + str;
        else
            str = "0x" + str;
        return str;
    }
    DISMUtil.formatByte = formatByte;
    function formatWord(val) {
        var str = (val & 0xFFFF).toString(16);
        while (str.length < 4)
            str = '0' + str;
        return "0x" + str;
    }
    DISMUtil.formatWord = formatWord;
    function getDestBit(op) {
        return ((op & 0x80) == 128) ? 'f' : 'w';
    }
    DISMUtil.getDestBit = getDestBit;
    function operandFileOp(opcode, op) {
        opcode = this.leftJustify(opcode, 8);
        var str = opcode + this.formatReg(op & 0x7F) + this.getDestBit(op);
        str = this.leftJustify(str, 30);
        return str;
    }
    DISMUtil.operandFileOp = operandFileOp;
    function operandBitOp(opcode, op) {
        opcode = this.leftJustify(opcode, 8);
        var bit = (op >> 7) & 7;
        opcode += this.formatReg(op & 0x7F) + ", " + bit.toString();
        opcode = this.leftJustify(opcode, 30);
        return opcode;
    }
    DISMUtil.operandBitOp = operandBitOp;
    function operandLiteralOp(opcode, val) {
        opcode = this.leftJustify(opcode, 8);
        if (val < 10)
            opcode += val.toString();
        else
            opcode += '0x' + this.hexFormat(val);
        opcode = this.leftJustify(opcode, 30);
        return opcode;
    }
    DISMUtil.operandLiteralOp = operandLiteralOp;
    function listHeader(pc, op, label) {
        var str = "";
        str += DISMUtil.leftJustify((pc == -1 ? "" : DISMUtil.hexFormat(pc, 2)), 5);
        str += DISMUtil.leftJustify((op == -1 ? "" : DISMUtil.hexFormat(op, 2)), 5);
        str += " ";
        //  var lbl = this.labelmap[pc];
        if (label)
            str += DISMUtil.leftJustify(label, 6);
        else
            str += "      ";
        return str + " ";
    }
    DISMUtil.listHeader = listHeader;
})(DISMUtil || (DISMUtil = {}));
var PIC16F19X_OPCODE = (function () {
    function PIC16F19X_OPCODE(pc, op) {
        this.pc = pc;
        this.op = op;
        this.next = undefined;
        this.prev = undefined;
        // just copyed form the datasheet
        switch (op & 0x3F00) {
            case 0x0700:
                this.operandFileOp("ADDRWF", op);
                this.comment = "Add W and f";
                return;
            case 0x3D00:
                this.operandFileOp("ADDWFC", op);
                this.comment = "Add with Carry W and f";
                return;
            case 0x0500:
                this.operandFileOp("ANDWF", op);
                this.comment = "AND W with f";
                return;
            case 0x3700:
                this.operandFileOp("ASRF", op);
                this.comment = "Arithmetic Right Shift";
                return;
            case 0x3500:
                this.operandFileOp("LSLF", op);
                this.comment = "Logical Left Shift";
                return;
            case 0x3600:
                this.operandFileOp("LSRF", op);
                this.comment = "Logical Right Shift";
                return;
            case 0x0100:
                if (op & 0x80) {
                    this.operand = op & 0x7F;
                    this.comment = "Clear f";
                    this.opcode = "CLRF";
                    this.operandString = DISMUtil.formatReg(this.operand);
                    this.isFileOp = true;
                    return;
                }
                else if ((op & 0xFC) == 0) {
                    this.opcode = "CLRW";
                    this.comment = "Clear f";
                    this.isFileOp = false;
                    return;
                }
                break;
            case 0x0900:
                this.operandFileOp("COMF", op);
                this.comment = "Complement f";
                return;
            case 0x0300:
                this.operandFileOp("DECF", op);
                this.comment = "Decrement f";
                return;
            case 0x0A00:
                this.operandFileOp("INCF", op);
                this.comment = "Increment f";
                return;
            case 0x0400:
                this.operandFileOp("IORWF", op);
                this.comment = "Inclusive OR W with f";
                return;
            case 0x0800:
                this.operandFileOp("MOVF", op);
                this.comment = "Move f";
                return;
            case 0x0000:
                if (op & 0x80) {
                    this.operandFileOp("MOVWF", op);
                    this.comment = "Move W to f";
                    return;
                }
                else if (op & 0x20) {
                    this.operandLiteralOp("MOVLB", (op & 0x1F));
                    this.comment = "Move literal to BSR";
                    return;
                }
                break;
            case 0x0D00:
                this.operandFileOp("RLF", op);
                this.comment = "Rotate Left f through Carry";
                return;
            case 0x0C00:
                this.operandFileOp("RRF", op);
                this.comment = "Rotate Right f through Carry";
                return;
            case 0x0200:
                this.operandFileOp("SUBWF", op);
                this.comment = "Subtract W from f";
                return;
            case 0x3B00:
                this.operandFileOp("SUBWFB", op);
                this.comment = "Subtract with Borrow W from f";
                return;
            case 0x0E00:
                this.operandFileOp("SWAPF", op);
                this.comment = "Swap nibbles in f";
                return;
            case 0x0600:
                this.operandFileOp("XORWF", op);
                this.comment = "Exclusive OR W with f";
                return;
            // Byte oriented skip opperations
            case 0x0B00:
                this.operandFileOp("DECFSZ", op);
                this.comment = "Decrement f, Skip if 0";
                return;
            case 0x0F00:
                this.operandFileOp("INCFSZ", op);
                this.comment = "Increment f, Skip if 0";
                return;
            //litteral operations
            case 0x3E00:
                this.operandLiteralOp("ADDLW", (op & 0xFF));
                this.comment = "Add literal and W";
                return;
            case 0x3900:
                this.operandLiteralOp("ANDLW", (op & 0xFF));
                this.comment = "AND literal with W";
                return;
            case 0x3800:
                this.operandLiteralOp("IORLW", (op & 0xFF));
                this.comment = "Inclusive OR literal with W";
                return;
            //case 0x0000: return this.operandLiteralOp("MOVLB",(op & 0xFF)) + "; Move literal to BSR"; break;
            case 0x3100:
                if (op & 0x80) {
                    this.operandLiteralOp("MOVLP", (op & 0x7F));
                    this.comment = "Move literal to PCLATH";
                    return;
                }
                break;
            case 0x3000:
                this.operandLiteralOp("MOVLW", (op & 0xFF));
                this.comment = "Move literal to W";
                return;
            case 0x3C00:
                this.operandLiteralOp("SUBLW", (op & 0xFF));
                this.comment = "Subtract W from literal";
                return;
            case 0x3A00:
                this.operandLiteralOp("XORLW", (op & 0xFF));
                this.comment = "Exclusive OR literal with W";
                return;
            case 0x3400:
                this.operandLiteralOp("RETLW", (op & 0xFF));
                this.comment = "Return with literal in W;";
                return;
        }
        // bit operations
        switch (op & 0x3C00) {
            case 0x1000:
                this.operandBitOp("BCF", op);
                this.comment = "Bit Clear f";
                return;
            case 0x1400:
                this.operandBitOp("BSF", op);
                this.comment = "Bit Set f";
                return;
            case 0x1800:
                this.operandBitOp("BTFSC", op);
                this.comment = "Bit Test f, Skip if Clear";
                return;
            case 0x1C00:
                this.operandBitOp("BTFSS", op);
                this.comment = "Bit Test f, Skip if Set";
                return;
        }
        switch (op & 0x3FFF) {
            case 0x000B:
                this.opcode = "BRW";
                this.comment = "Relative Branch with W";
                return;
            case 0x000A:
                this.opcode = "CALLW";
                this.comment = "Call Subroutine with W";
                return;
            case 0x0008:
                this.opcode = "RETURN";
                this.comment = "Return from Subroutine";
                return;
            case 0x0064:
                this.opcode = "CLRWDT";
                this.comment = "Clear Watchdog Timer";
                return;
            case 0x0000:
                this.opcode = "NOP";
                this.comment = "No Operation";
                return;
            case 0x0062:
                this.opcode = "OPTION";
                this.comment = "Load OPTION_REG register with W";
                return;
            case 0x0001:
                this.opcode = "RESET";
                this.comment = "Software device Reset";
                return;
            case 0x1063:
                this.opcode = "SLEEP";
                this.comment = "Go into Standby mode";
                return;
        }
        // calls and branches
        if ((op & 0x3200) == 0x3200) {
            var offset = (op & 0x1FF) << 23 >> 23;
            this.branchTarget = pc + 1 + offset;
            this.operandLiteralOp("BRA", offset);
            this.comment = "Relative Branch to " + offset;
            return;
        }
        else if ((op & 0x2000) == 0x2000) {
            if ((op & 0x1000)) {
                this.operandLiteralOp("GOTO", this.branchTarget = (op & 0x7FF));
                this.comment = "Go to address";
            }
            else {
                this.operandLiteralOp("CALL", this.branchTarget = (op & 0x7FF));
                this.comment = "Call Subroutine";
            }
        }
        else if (((op & 0x18) == 0x18) || ((op & 0x18) == 0x10)) {
            this.isFileOp = false;
            this.opcode = (((op & 0x18) == 0x18) ? "MOVWI" : "MOVIW");
            this.operand = op & 0x7;
            this.comment = this.opcode == "MOVWI" ? "Move W to INDFn" : "Move INDFn to W";
            switch (this.operand) {
                case 0x0:
                    this.operandString = "++INDF0";
                    this.comment += ", pre inc";
                    break;
                case 0x1:
                    this.operandString = "--INDF0";
                    this.comment += ", pre dec";
                    break;
                case 0x2:
                    this.operandString = "INDF0++";
                    this.comment += ", post inc";
                    break;
                case 0x3:
                    this.operandString = "INDF0--";
                    this.comment += ", post dec";
                    break;
                case 0x4:
                    this.operandString = "++INDF1";
                    this.comment += ", pre inc";
                    break;
                case 0x5:
                    this.operandString = "--INDF1";
                    this.comment += ", pre dec";
                    break;
                case 0x6:
                    this.operandString = "INDF1++";
                    this.comment += ", post inc";
                    break;
                case 0x7:
                    this.operandString = "INDF1--";
                    this.comment += ", post dec";
                    break;
            }
        }
        else if (((op & 0x3f80) == 0x3F80) || ((op & 0x3f80) == 0x3F00)) {
            this.isFileOp = false;
            this.opcode = (((op & 0x3f80) == 0x3F80) ? "MOVWI" : "MOVIW");
            this.comment = this.opcode == "MOVWI" ? "Move W to INDFn, Indexed Indirect." : "Move INDFn to W, Indexed Indirect.";
            this.operand = (op & 0x1F) | ((op & 0x10) ? 0xFFFFFFE0 : 0);
            this.dist = (0x40 & op) ? "[INDF1]" : "[INDF0]";
            this.operandString = this.operand.toString() + this.dist;
        }
        else if ((op & 0x60) == 0x60) {
            this.operandLiteralOp("TRIS", (op & 7));
            this.comment = "Load TRIS register with W";
        }
        if (!this.opcode) {
            this.opcode = "ERR";
            this.operand = op;
            this.operandString = '0x' + DISMUtil.hexFormat(op);
        }
    }
    PIC16F19X_OPCODE.prototype.operandFileOp = function (opcode, op) {
        this.opcode = opcode;
        this.operand = op & 0x7F;
        this.dist = DISMUtil.getDestBit(op);
        this.operandString = DISMUtil.formatReg(this.operand) + this.dist;
        this.isFileOp = true;
    };
    PIC16F19X_OPCODE.prototype.operandBitOp = function (opcode, op) {
        this.isFileOp = true;
        this.opcode = opcode;
        this.operand = op & 0x7F;
        this.bit = (op >> 7) & 7;
        this.operandString = DISMUtil.formatReg(this.operand) + ", " + this.bit.toString();
    };
    PIC16F19X_OPCODE.prototype.operandLiteralOp = function (opcode, val) {
        this.isFileOp = false;
        this.opcode = opcode;
        this.operand = val;
        this.operandString;
        var str = DISMUtil.leftJustify(opcode, 8);
        if (val < 10)
            this.operandString = val.toString();
        else
            this.operandString = '0x' + DISMUtil.hexFormat(val);
    };
    PIC16F19X_OPCODE.prototype.toString = function () {
        var str = DISMUtil.leftJustify(this.opcode, 7);
        if (this.operandString)
            str += this.operandString;
        if (this.bit !== undefined)
            str += "," + this.bit;
        else if (this.dist !== undefined)
            str += "," + this.dist;
        str = DISMUtil.leftJustify(str, 18);
        if (this.comment)
            str += "; " + this.comment;
        return DISMUtil.listHeader(this.pc, this.op, this.label) + str;
    };
    return PIC16F19X_OPCODE;
}());
var ControlFlowEdge = (function () {
    function ControlFlowEdge(source, target) {
        this.source = source;
        this.target = target;
    }
    ControlFlowEdge.prototype.toString = function () {
        return ':#' + this.target.blockIndex;
    };
    return ControlFlowEdge;
}());
var ControlFlowNodeSet = (function () {
    function ControlFlowNodeSet() {
        this.nodes = [];
    }
    ControlFlowNodeSet.prototype.add = function (n) {
        if (!this.has(n))
            return false;
        this.nodes.push(n);
        return true;
    };
    ControlFlowNodeSet.prototype.has = function (n) {
        for (var _i = 0, _a = this.nodes; _i < _a.length; _i++) {
            var e = _a[_i];
            if (e == n)
                return false;
        }
        return true;
    };
    return ControlFlowNodeSet;
}());
var ControlFlowNode = (function () {
    function ControlFlowNode(index, offset, start, end) {
        this.offset = offset;
        this.blockIndex = index;
        this.start = start;
        this.end = end;
        this.visited = false;
        this.incomming = [];
        this.outgoing = [];
        this.dominatorTreeChildren = [];
    }
    ControlFlowNode.prototype.predecessors = function () {
        return this.incomming.map(function (v) { return v.source; });
    };
    ControlFlowNode.prototype.successors = function () {
        return this.outgoing.map(function (v) { return v.target; });
    };
    ControlFlowNode.prototype.traversePreOrder = function (childrenFunc, visitAction) {
        if (this.visited)
            return;
        this.visited = true;
        visitAction(this);
        var children = childrenFunc(this);
        for (var i in children)
            children[i].traversePreOrder(childrenFunc, visitAction);
    };
    ControlFlowNode.prototype.traversePostOrder = function (childrenFunc, visitAction) {
        if (this.visited)
            return;
        this.visited = true;
        var children = childrenFunc(this);
        for (var i in children)
            children[i].traversePreOrder(childrenFunc, visitAction);
        visitAction(this);
    };
    /// <summary>
    /// Gets whether <c>this</c> dominates <paramref name="node"/>.
    /// </summary>
    ControlFlowNode.prototype.dominates = function (node) {
        // TODO: this can be made O(1) by numbering the dominator tree
        var tmp = node;
        while (tmp != null && tmp !== undefined) {
            if (tmp == this)
                return true;
            tmp = tmp.immediateDominator;
        }
        return false;
    };
    ControlFlowNode.prototype.toString = function () {
        var str = "";
        str = "Block#" + this.blockIndex;
        if (this.offset >= 0)
            str += " Offset " + this.offset;
        if (this.start)
            str += ": GM_" + this.start.pc;
        if (this.end)
            str += " to GM_" + this.end.pc;
        if (this.immediateDominator) {
            str += '\n';
            str += "ImmediateDominator: #" + this.immediateDominator.blockIndex;
        }
        if (this.dominanceFrontier) {
            str += '\n';
            str += "DominanceFrontier: ";
            var slist = [];
            for (var _i = 0, _a = this.dominanceFrontier.nodes; _i < _a.length; _i++) {
                var n = _a[_i];
                slist.push(n.blockIndex.toString());
            }
            str += slist.sort().join(',');
        }
        var inst = this.start;
        while (inst) {
            str += "\n";
            str += "\t" + inst.toString();
            inst = inst.next;
        }
        return str;
    };
    return ControlFlowNode;
}());
function findCommonDominator(b1, b2) {
    // Here we could use the postorder numbers to get rid of the hashset, see "A Simple, Fast Dominance Algorithm"
    var path1 = new ControlFlowNodeSet();
    while (b1 !== undefined && path1.add(b1))
        b1 = b1.immediateDominator;
    while (b2 != null) {
        if (path1.has(b2))
            return b2;
        else
            b2 = b2.immediateDominator;
    }
    throw "No common dominator found!";
}
var ControlFlowGraph = (function () {
    function ControlFlowGraph(nodes) {
        this.nodes = nodes;
        this.entry = this.nodes[0];
    }
    ControlFlowGraph.prototype.resetVisited = function () {
        for (var i in this.nodes)
            this.nodes[i].visited = false;
    };
    ControlFlowGraph.prototype.computeDominance = function () {
        // A Simple, Fast Dominance Algorithm
        // Keith D. Cooper, Timothy J. Harvey and Ken Kennedy
        var entry = this.entry;
        this.entry.immediateDominator = entry;
        var changed = true;
        while (changed) {
            this.resetVisited();
            this.entry.traversePreOrder(function (b) { return b.successors(); }, function (b) {
                if (b != entry) {
                    var pred = b.predecessors();
                    var newIdom = void 0;
                    for (var _i = 0, pred_1 = pred; _i < pred_1.length; _i++) {
                        var block = pred_1[_i];
                        if (block.visited && block != b) {
                            newIdom = block;
                            break;
                        }
                    }
                    // for all other predecessors p of b
                    for (var _a = 0, pred_2 = pred; _a < pred_2.length; _a++) {
                        var p = pred_2[_a];
                        if (p != b && p.immediateDominator != null) {
                            newIdom = findCommonDominator(p, newIdom);
                        }
                    }
                    if (b.immediateDominator != newIdom) {
                        b.immediateDominator = newIdom;
                        changed = true;
                    }
                }
            });
        }
        this.entry.immediateDominator = undefined;
        for (var _i = 0, _a = this.nodes; _i < _a.length; _i++) {
            var node = _a[_i];
            if (node.immediateDominator !== undefined)
                node.immediateDominator.dominatorTreeChildren.push(node);
        }
    };
    /// <summary>
    /// Computes dominance frontiers.
    /// This method requires that the dominator tree is already computed!
    /// </summary>
    ControlFlowGraph.prototype.ComputeDominanceFrontier = function () {
        this.resetVisited();
        this.entry.traversePostOrder(function (b) { return b.dominatorTreeChildren; }, function (n) {
            //logger.WriteLine("Calculating dominance frontier for " + n.Name);
            n.dominanceFrontier = new ControlFlowNodeSet();
            // DF_local computation
            for (var _i = 0, _a = n.successors(); _i < _a.length; _i++) {
                var succ = _a[_i];
                if (succ.immediateDominator != n) {
                    //logger.WriteLine("  local: " + succ.Name);
                    n.dominanceFrontier.add(succ);
                }
            }
            // DF_up computation
            for (var _b = 0, _c = n.dominatorTreeChildren; _b < _c.length; _b++) {
                var child = _c[_b];
                for (var _d = 0, _e = child.dominanceFrontier.nodes; _d < _e.length; _d++) {
                    var p = _e[_d];
                    if (p.immediateDominator != n) {
                        //logger.WriteLine("  DF_up: " + p.Name + " (child=" + child.Name);
                        n.dominanceFrontier.add(p);
                    }
                }
            }
        });
    };
    return ControlFlowGraph;
}());
var GraphBuilder = (function () {
    function GraphBuilder(M) {
        this.M = M;
        for (var _i = 0, M_1 = M; _i < M_1.length; _i++) {
            var i = M_1[_i];
            if (!i)
                continue;
            if (i.prev === undefined || i.prev == null)
                this.firstInst = i;
            if (i.next === undefined || i.next == null)
                this.lastInst = i;
        }
    }
    GraphBuilder.prototype.createNodeEdge = function (source, destination) {
        var edge = new ControlFlowEdge(source, destination);
        source.outgoing.push(edge);
        destination.incomming.push(edge);
    };
    GraphBuilder.prototype.createLabelEdge = function (fromNode, label) {
        for (var _i = 0, _a = this.nodes; _i < _a.length; _i++) {
            var n = _a[_i];
            if (n.start.label == label) {
                this.createNodeEdge(fromNode, n);
                return;
            }
        }
        throw "Could not find label";
    };
    GraphBuilder.prototype.createInstEdge = function (fromNode, inst) {
        for (var _i = 0, _a = this.nodes; _i < _a.length; _i++) {
            var n = _a[_i];
            if (n.start == inst) {
                this.createNodeEdge(fromNode, n);
                return;
            }
        }
        throw "Could not find label";
    };
    GraphBuilder.prototype.nextInstructionEdge = function (node) {
        if (!node.end.next)
            this.createNodeEdge(node, this.regularExit);
        else
            this.createInstEdge(node, node.end.next);
    };
    GraphBuilder.prototype.CreateRegularControlFlow = function () {
        var last = this.lastInst;
        this.createInstEdge(this.entryPoint, this.firstInst);
        for (var _i = 0, _a = this.nodes; _i < _a.length; _i++) {
            var node = _a[_i];
            //Debug.Assert(node.BlockIndex != 93);
            if (node.end) {
                var code = node.end;
                var label = node.end.operandString;
                switch (code.opcode) {
                    case "BSR":
                    case "GOTO":
                        this.createLabelEdge(node, code.operandString);
                        break;
                    case "RETURN":
                    case "RESET":
                        this.createNodeEdge(node, this.regularExit);
                        break;
                    default:
                        this.nextInstructionEdge(node);
                        break;
                }
            }
        }
    };
    GraphBuilder.prototype.buildGraph = function (entryLabel) {
        var nodes = (this.nodes = []);
        // caculate incomming jump
        var inst = this.firstInst;
        var index = 0;
        var entryPoint = new ControlFlowNode(nodes.length, -1);
        nodes.push(entryPoint);
        var exitPoint = new ControlFlowNode(nodes.length, -1);
        nodes.push(exitPoint);
        this.entryPoint = entryPoint;
        this.regularExit = exitPoint;
        while (inst) {
            var blockStart = inst;
            while ((inst = inst.next)) {
                if (inst.opcode == "BRA" || inst.opcode == "GOTO" || inst.opcode == "RETURN" || inst.opcode == "RESET")
                    break; // is a branch
                if (inst.next && inst.next.label !== undefined)
                    break; // has an incomming jump
            }
            var node = new ControlFlowNode(nodes.length, blockStart.pc, blockStart, inst);
            nodes.push(node);
        }
        if (console) {
            var strl = [];
            for (var _i = 0, _a = this.nodes; _i < _a.length; _i++) {
                var n = _a[_i];
                strl.push(n.toString());
            }
            var str = strl.join('\n');
            console.log(str);
        }
        //    this.CreateRegularControlFlow();
    };
    return GraphBuilder;
}());
var PIC16F19X_DSAM = (function () {
    function PIC16F19X_DSAM() {
        this._hexFormatCache = []; // use this alot so thought lookups be faster than rebuilding an array and join
        this.label_count = 0;
        this.labelmap = {};
        this.makeLabelsForBranches = true; // default
        var i = 0;
    }
    PIC16F19X_DSAM.prototype.setMakeLabelsForBranches = function (value) {
        this.makeLabelsForBranches = value;
    };
    PIC16F19X_DSAM.prototype.getLabel = function (addr, prefix) {
        if (prefix === void 0) { prefix = "L"; }
        var lbl = this.labelmap[addr];
        if (lbl === undefined) {
            var val = (this.label_count++ & 0xFFFF).toString(16).toUpperCase();
            while (val.length < 4)
                val = '0' + val;
            this.labelmap[addr] = lbl = prefix + val;
        }
        return lbl;
    };
    PIC16F19X_DSAM.prototype.doVectorInfo = function (num, addr, vname) {
        this.labelmap[addr] = "V" + vname;
        this.labelmap[num] = vname; // create the labels here
        this.label_count += 2;
        return DISMUtil.listHeader(addr, num, vname) + "; " + vname + " VECTOR: " + DISMUtil.hexFormat(num, 2) + "\n";
    };
    PIC16F19X_DSAM.prototype.if1BitThenOut = function (flag, bit, name, yes, no) {
        var b = (flag >> bit) & 1;
        var str = "; " + name + "=" + b;
        str = DISMUtil.leftJustify(str, 13);
        return str + ": " + (b != 0 ? yes : no);
    };
    PIC16F19X_DSAM.prototype.if1BitThenOut4 = function (flag, bit, name, list) {
        var mask = (1 << bit) | (1 << (bit + 1));
        var what = (flag & mask) >>> bit;
        var str = "; " + name + "=" + what;
        str = DISMUtil.leftJustify(str, 13);
        return str + ": " + list[what];
    };
    PIC16F19X_DSAM.prototype.outputconfig2 = function (flag1, flag2) {
        if (flag2 === undefined)
            return "";
        var head = DISMUtil.listHeader(0x8008, flag2);
        var str = "";
        str += head + this.if1BitThenOut(flag2, 13, "LVP", "Low-voltage programming enabled", "High-voltage on MCLR/VPP must be used for programming") + "\n";
        str += head + this.if1BitThenOut(flag2, 12, "DEBUG", "In-Circuit Debugger disabled, RB6/ICSPCLK and RB7/ICSPDAT are general purpose I/O pins", "In-Circuit Debugger enabled, RB6/ICSPCLK and RB7/ICSPDAT are dedicated to the debugger") + "\n";
        str += head + this.if1BitThenOut(flag2, 10, "BORV", "Brown-out Reset voltage set to 1.9V", "Brown-out Reset voltage set to 2.5V") + "\n";
        str += head + this.if1BitThenOut(flag2, 9, "STVREN", "Stack Overflow or Underflow will cause a Reset", "Stack Overflow or Underflow will not cause a Reset") + "\n";
        str += head + this.if1BitThenOut(flag2, 8, "PLLEN", "4xPLL enabled", "4xPLL disabled") + "\n";
        str += head + this.if1BitThenOut4(flag2, 4, "VCAPEN", ["VCAP functionality is enabled on RA0", "VCAP functionality is enabled on RA5", "VCAP functionality is enabled on RA6", "No capacitor on VCAP pin"]) + "\n";
        // Since I am only doing the PIC 16F1933, then this is limited
        str += head + this.if1BitThenOut4(flag2, 4, "WRT", ["000h to FFFh write-protected", "000h to 7FFh write-protected", "000h to 1FFh write-protected", "Write protection off"]) + "\n";
        return str;
    };
    PIC16F19X_DSAM.prototype.outputconfig1 = function (flag1, flag2) {
        if (flag1 === undefined)
            return "";
        var head = DISMUtil.listHeader(0x8007, flag1);
        var str = "";
        str += head + this.if1BitThenOut(flag1, 13, "FCMEM", "Fail-Safe Clock Monitor is enabled;", "Fail-Safe Clock Monitor is disabled") + "\n";
        str += head + this.if1BitThenOut(flag1, 12, "IESO", "Internal/External Switchover mode is enabled", "Internal/External Switchover mode is disabled") + "\n";
        str += head + this.if1BitThenOut(flag1, 11, "CLKOUTEN", "CLKOUT function is disabled. I/O or oscillator function on RA6/CLKOUT", "CLKOUT function is enabled on RA6/CLKOUT") + "\n";
        str += head + this.if1BitThenOut4(flag1, 9, "BOREN", ["BOR disabled", "BOR controlled by SBOREN bit of the PCON register", "BOR enabled during operation and disabled in Sleep", "BOR enabled"]) + "\n";
        str += head + this.if1BitThenOut(flag1, 8, "CPD", "Data memory code protection is disabled", "Data memory code protection is enabled") + "\n";
        str += head + this.if1BitThenOut(flag1, 7, "CP", "Program memory code protection is disabled", "Program memory code protection is enabled") + "\n";
        if (!(flag2 & (1 << 13)))
            str += head + this.if1BitThenOut(flag1, 6, "MCLRE", "RE3/MCLR/VPP pin function is MCLR; Weak pull-up enabled.", "RE3/MCLR/VPP pin function is digital input; MCLR internally disabled; Weak pull-up under control of WPUE3") + "\n";
        str += head + this.if1BitThenOut(flag1, 5, "PWRTE", "PWRT disabled", "PWRT enabled") + "\n";
        str += head + this.if1BitThenOut4(flag1, 3, "WDTE", ["WDT disabled", "WDT controlled by the SWDTEN bit in the WDTCON register", "WDT enabled while running and disabled in Sleep", "WDT enabled"]) + "\n";
        str += head + DISMUtil.leftJustify("; FOSC=" + (flag1 & 0x3), 13) + ": ";
        switch (flag1 & 0x3) {
            case 7:
                str += "ECH: External Clock, High - Power mode: CLKIN on RA7/ OSC1 / CLKIN";
                break;
            case 6:
                str += "ECM: External Clock, Medium - Power mode: CLKIN on RA7/ OSC1 / CLKIN";
                break;
            case 5:
                str += "ECL: External Clock, Low - Power mode: CLKIN on RA7/ OSC1 / CLKIN";
                break;
            case 4:
                str += "INTOSC oscillator: I / O function on RA7/ OSC1 / CLKIN";
                break;
            case 3:
                str += "EXTRC oscillator: RC function on RA7/ OSC1 / CLKIN";
                break;
            case 2:
                str += "HS oscillator: High - speed crystal/ resonator on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN";
                break;
            case 1:
                str += "XT oscillator: Crystal / resonator on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN";
                break;
            case 0:
                str += "LP oscillator: Low - power crystal on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN";
                break;
        }
        str += "\n";
        return str;
    };
    // attempt to convert the comments to something easyer to read
    PIC16F19X_DSAM.prototype.basicDecode = function () {
        // let graph = new GraphBuilder(this.M);  
        //  graph.buildGraph(this.M[0].label);
        var M = this.M;
        var bank = 0;
        for (var i = 0; i < M.length; i++) {
            var current = M[i];
            var next = M[i + 1];
            switch (current.opcode) {
                case "MOVLB":
                    if (next && next.opcode == "MOVLB" && !next.label) {
                        current.comment = null;
                        next.comment = "BANK=" + next.operand;
                        i++; // we have a double move, make sure next 
                    }
                    else
                        current.comment = "BANK=" + current.operand;
                    break;
                case "MOVF":
                    if (current.dist == "w" && next && next.opcode == "MOVWF" && !next.label) {
                        current.comment = null;
                        next.comment = next.operandString + "=" + current.operandString;
                        i++;
                    }
                    break;
                case "CLRF":
                    current.comment = current.operandString + " = 0";
                    break;
                case "BCF":
                    current.comment = current.operandString + "(" + current.bit + ") = 0";
                    break;
                case "BSF":
                    current.comment = current.operandString + "(" + current.bit + ") = 1";
                    break;
                case "BTFSS":
                    if (next && next.opcode == "BRA" || next.opcode == "CALL" || next.opcode == "GOTO") {
                        var str = next.opcode == "CALL" ? ") call " : ") goto ";
                        current.comment = "if !" + current.operandString + "(" + current.bit + str + next.operandString;
                        next.comment = null;
                    }
                    else
                        current.comment = "if " + current.operandString + "(" + current.bit + ") then skip";
                    break;
                case "BTFSC":
                    if (next && next.opcode == "BRA" || next.opcode == "CALL" || next.opcode == "GOTO") {
                        var str = next.opcode == "CALL" ? ") call " : ") goto ";
                        current.comment = "if " + current.operandString + "(" + current.bit + str + next.operandString;
                        next.comment = null;
                    }
                    else
                        current.comment = "if !" + current.operandString + "(" + current.bit + ") then skip";
                    break;
                case "MOVLW":
                    if (next && next.opcode == "MOVWF") {
                        current.comment = null;
                        next.comment = next.operandString + "=" + current.operandString;
                        i++;
                    }
                    break;
            }
        }
        //     0006 300F         MOVLW  0x0F       ; Move literal to W
        //   0007 0097         MOVWF  WDTCON, f; Move W to f
    };
    PIC16F19X_DSAM.prototype.dismw = function (mem) {
        this.label_count = 0;
        this.labelmap = {};
        var str = "";
        this.M = [];
        var guessBSR = 0;
        // pass 1, get all labels
        var prev = null;
        for (var i = 0; i < mem.length; i++) {
            var op = mem[i];
            var o = undefined;
            if (op !== undefined && op != -1) {
                o = new PIC16F19X_OPCODE(i, op);
                // set up a linked list
                o.prev = prev;
                o.next = null;
                if (prev != null)
                    prev.next = o;
                prev = o;
                if (o.branchTarget !== undefined) {
                    var lbl = this.getLabel(o.branchTarget);
                    o.operandString = lbl;
                }
                else if (o.isFileOp) {
                    o.operandString = DISMUtil.formatReg(o.operand, guessBSR);
                }
                else {
                    switch (o.opcode) {
                        case "MOVLB":
                            guessBSR = o.operand;
                            break;
                    }
                }
                this.M.push(o);
            }
        }
        this.basicDecode();
        // second pass, link the labels and make the string lines
        for (var _i = 0, _a = this.M; _i < _a.length; _i++) {
            var o_1 = _a[_i];
            var lbl = this.labelmap[o_1.pc];
            if (lbl !== undefined)
                o_1.label = lbl;
            str += o_1.toString() + "\n";
        }
        str += this.outputconfig1(mem[0x8007], mem[0x8008]);
        str += this.outputconfig2(mem[0x8007], mem[0x8008]);
        return str;
    };
    PIC16F19X_DSAM.prototype.disam = function (R) {
        return this.dismw(R.W);
    };
    return PIC16F19X_DSAM;
}());
//# sourceMappingURL=pic16f19x_dsam.js.map