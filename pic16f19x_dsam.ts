

// What the fuck?

class HexRecord {
    data: number[];
    count: number;    // error, the type of 'length' is not a subtype of the indexer
    recType: number;
    addr: number;
    chksum: number;

    constructor(line : string) {
        if (line.length < 11 || line[0] != ':') throw "Missing collon";
        var pos = 1;
        var chk = 0;
        this.data = [];
        function nextByte(): number { var num = parseInt(line.substr(pos, 2), 16); pos += 2; chk += num & 0xFF; return num; }
        this.count = nextByte();
        this.addr = nextByte() << 8; this.addr |= nextByte();
        this.recType = nextByte();
        for (var i = 0; i < this.count; i++) this.data.push(nextByte());
        var fchk = nextByte();
        chk &= 0xFF;
        if (pos < line.length) throw "Bad End of line";
        if (chk != 0) throw "Bad Checksum";
        this.chksum = fchk;
    }
    formatHex(val: number, digits: number) :string {
        var str = val.toString(16).toUpperCase();
        while (str.length < digits) str = '0' + str;
        return str;
    }
    isEqual(o: HexRecord): boolean {
        if (this.recType != o.recType) return false;
        if (this.count != o.count) return false;
        if (this.addr != o.addr) return false;
        for (var i = 0; i < this.count; i++) if (this.data[i] != o.data[i]) return false;
        return true;
    }
    toString(): string {
        var str = ":";
        var chk: number = 0;
        var val: number = 0;
        chk += this.count; str += this.formatHex(this.count, 2);
        chk += this.addr; str += this.formatHex(this.addr, 4);
        chk += this.recType; str += this.formatHex(this.recType, 2);
        for (var i = 0; i < this.count; i++) {
            var val = this.data[i];
            chk += val; str += this.formatHex(val, 2);
        }
        var ichk = ((~chk & 0xFF) + 1) & 0xFF;
        str += this.formatHex(ichk, 2);
        return str;

    }
} 

class IHEXFILE {
    B: number[]; // data in bytes
    W: number[]; // data in words
    R: HexRecord[];
    text: string;
    debug: (msg: string) => void;
    clear() {
        this.text = "";
        this.B = [];
        this.W = [];
        this.R = [];
        for (var i = 0; i < 0x10000; i++) this.B[i] = this.W[i] = -1;
    }
    constructor() {
        this.clear();
    }
    error(msg: string) {
        if (this.debug) this.debug(msg);
        else {
            alert(msg);
        }
    }
    process(text: string, wordSwap?: boolean) {
        wordSwap = wordSwap || false;
        var R = this.R;
        this.clear();
        var error = this.error;
        this.text = text;
        var addru: number = 0;
        var addrl: number = 0;
        var lines = text.split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/); // This should cover eveything..  One can hope:P
        var line = "";
        var lineno: number = 0;

        for (lineno = 0; lineno < lines.length; lineno++) {
            line = lines[lineno].trim();
            if (line.length < 11 || line[0] != ':') throw "Bad Line at " + i;
            var data = new HexRecord(line);
            switch (data.recType) {
                case 0:
                    var addr = data.addr + (addrl | (addru << 16)); // add the segment if I ever get around to setting it up
                    var last: number;
                    if (data.count != data.data.length) error("Somethings wrong");
                    for (var i = 0; i < data.count; i++) {
                        var d = data.data[i];
                        if (d === undefined || d == NaN || d < 0 || d > 0xFF) error("Somethings wrong");
                        var nadd = addr + i;
                        this.B[nadd] = d;
                        if (nadd & 1) this.W[nadd >> 1] = wordSwap ? (last | (d << 8)) : (d | (last << 8));
                        last = d;
                    }
                    break;
                case 1:// end of file
                    if (data.count != 0) error( "Extra Data at end of file at line " + i);
                    return; // we are done!
                case 2:
                case 3:
                    error( "Segments not supported, cause I am lazy");
                    break;
                case 4: // have to atleast support this
                    if (data.count != 2) error("Extended Linear Address must have a byte count of 2");
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
    }

}
module DISMUtil {
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
    bank[0] = []
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
    bank[1] = []
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
    bank[2] = []
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
    bank[3] = []
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
    bank[4] = []
    bank[4][0x0D] = "WPUB";
    bank[4][0x10] = "WPUE";
    bank[4][0x11] = "SSPxBUF";
    bank[4][0x12] = "SSPxADD";
    bank[4][0x13] = "SSPxMSK";
    bank[4][0x14] = "SSPxSTAT";
    bank[4][0x15] = "SSPxCON1";
    bank[4][0x16] = "SSPxCON2";
    bank[4][0x17] = "SSPxCON3";
    bank[5] = []
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
    bank[6] = []
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
    bank[7] = []
    bank[7][0x14] = "IOCBP";
    bank[7][0x15] = "IOCBN";
    bank[7][0x16] = "IOCBF";
    bank[8] = []
    bank[8][0x15] = "TMR4";
    bank[8][0x16] = "PR4";
    bank[8][0x17] = "T4CON";
    bank[8][0x1C] = "TMR6";
    bank[8][0x1D] = "PR6";
    bank[8][0x1E] = "T6CON";
    export function formatReg(reg: number, bankno? : number): string {
        var reg_name: string;
        if (reg < 0xC) reg_name = operandToReg[reg];
        else if (bankno !== undefined) {
            reg_name = bank[bankno][reg];
        }
        return reg_name === undefined || reg_name == null || reg_name.length == 0 ? '0x' + this.hexFormat(reg) : reg_name;
    }
    export function hexFormat(val: number, bytes?: number): string {
        var s = "";
        if (bytes === undefined || bytes == 1) {
            val &= 0xFF;
            if (val <= 0xF) s += '0';
        } else if (bytes == 2) {
            val &= 0xFFFF
            if (val <= 0xF) s += '000';
            else if (val <= 0xFF) s += '00';
            else if (val <= 0xFFF) s += '0';
        } else throw "SHOULDN";
        return s + val.toString(16).toUpperCase();
    }
    var _leftJustifyCache: string[] = []; // use this alot so thought lookups be faster than rebuilding an array and join
    export function leftJustify(s: string, length: number): string {
        var len = length - s.length;
        if (len <= 0) return s;
        var fills = _leftJustifyCache[len];
        if (fills === undefined) {
            var fill = [];
            while (fill.length + s.length < length) fill[fill.length] = ' ';
            fills = fill.join('');
            _leftJustifyCache[len] = fills;
        }
        return s + fills;
    }
    export function formatByte(val: number): string {
        var str = (val & 0xFF).toString(16);
        if (str.length == 1) str = '0x0' + str; else str = "0x" + str;
        return str;
    }
    export function formatWord(val: number): string {
        var str = (val & 0xFFFF).toString(16);
        while (str.length < 4) str = '0' + str;
        return "0x" + str;
    }


   
    export function getDestBit(op: number): string {
        return ((op & 0x80) == 128) ? 'f' : 'w';
    }

    export function operandFileOp(opcode: string, op: number): string { //dfffffff
        opcode = this.leftJustify(opcode, 8);
        var str = opcode + this.formatReg(op & 0x7F) + this.getDestBit(op);
        str = this.leftJustify(str, 30);
        return str;
    }
    export function operandBitOp(opcode: string, op: number): string { //dfffffff
        opcode = this.leftJustify(opcode, 8);
        var bit = (op >> 7) & 7;
        opcode += this.formatReg(op & 0x7F) + ", " + bit.toString();
        opcode = this.leftJustify(opcode, 30);
        return opcode;
    }
    export function operandLiteralOp(opcode: string, val: number): string { // this requires the operand as k can be diffrent lengths
        opcode = this.leftJustify(opcode, 8);
        if (val < 10) opcode += val.toString();
        else opcode += '0x' + this.hexFormat(val);

        opcode = this.leftJustify(opcode, 30);
        return opcode;
    }
    export function listHeader(pc: number, op: number, label?: string): string {
        var str = "";
        str += DISMUtil.leftJustify((pc == -1 ? "" : DISMUtil.hexFormat(pc, 2)), 5);
        str += DISMUtil.leftJustify((op == -1 ? "" : DISMUtil.hexFormat(op, 2)), 5);
        str += " ";
        //  var lbl = this.labelmap[pc];
        if (label)
            str += DISMUtil.leftJustify(label, 6);
        else
            str += "      ";
        return str+" ";
    }
}
class PIC16F19X_OPCODE {
    next: PIC16F19X_OPCODE;
    prev: PIC16F19X_OPCODE;
    isFileOp: boolean;
    branchTarget: number;
    op: number;
    pc: number;
    dist: string;
    bit: number;
    opcode: string;
    operand: number;
    operandString: string; // used on caculated labels
    comment: string;
    label: string;

    private operandFileOp(opcode: string, op: number) { //dfffffff
        this.opcode = opcode;
        this.operand = op & 0x7F;
        this.dist = DISMUtil.getDestBit(op);
        this.operandString = DISMUtil.formatReg(this.operand) + this.dist;
        this.isFileOp = true;
    }
    private operandBitOp(opcode: string, op: number) { //dfffffff
        this.isFileOp = true;
        this.opcode = opcode;
        this.operand = op & 0x7F;
        this.bit = (op >> 7) & 7;
        this.operandString = DISMUtil.formatReg(this.operand) + ", " + this.bit.toString();
    }
    private operandLiteralOp(opcode: string, val: number) { // this requires the operand as k can be diffrent lengths
        this.isFileOp = false;
        this.opcode = opcode;
        this.operand = val;
        this.operandString
        var str = DISMUtil.leftJustify(opcode, 8);
        if (val < 10) this.operandString = val.toString();
        else this.operandString = '0x' + DISMUtil.hexFormat(val);
    }
    constructor(pc: number, op: number) {
        this.pc = pc;
        this.op = op;
        this.next = undefined;
        this.prev = undefined;
        // just copyed form the datasheet
        switch (op & 0x3F00) { // all byte operations
            case 0x0700: this.operandFileOp("ADDRWF", op); this.comment =  "Add W and f"; return;
            case 0x3D00: this.operandFileOp("ADDWFC", op); this.comment = "Add with Carry W and f"; return;
            case 0x0500: this.operandFileOp("ANDWF", op); this.comment = "AND W with f"; return;
            case 0x3700: this.operandFileOp("ASRF", op); this.comment = "Arithmetic Right Shift"; return;
            case 0x3500: this.operandFileOp("LSLF", op); this.comment = "Logical Left Shift"; return;
            case 0x3600: this.operandFileOp("LSRF", op); this.comment = "Logical Right Shift"; return;
            case 0x0100:
                if (op & 0x80) {
                    this.operand = op & 0x7F;
                    this.comment = "Clear f";
                    this.opcode = "CLRF";
                    this.operandString = DISMUtil.formatReg(this.operand);
                    this.isFileOp = true;
                    return;
                }
                else if ((op & 0xFC) == 0) {// don't care about the last two bits?
                    this.opcode = "CLRW";
                    this.comment = "Clear f";
                    this.isFileOp = false;
                    return;
                }
                break;
            case 0x0900: this.operandFileOp("COMF", op); this.comment = "Complement f"; return;
            case 0x0300: this.operandFileOp("DECF", op); this.comment = "Decrement f"; return;
            case 0x0A00: this.operandFileOp("INCF", op); this.comment = "Increment f"; return;
            case 0x0400: this.operandFileOp("IORWF", op); this.comment = "Inclusive OR W with f"; return;
            case 0x0800: this.operandFileOp("MOVF", op); this.comment = "Move f"; return;
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
            case 0x0D00: this.operandFileOp("RLF", op); this.comment = "Rotate Left f through Carry"; return;
            case 0x0C00: this.operandFileOp("RRF", op); this.comment = "Rotate Right f through Carry"; return;
            case 0x0200: this.operandFileOp("SUBWF", op); this.comment = "Subtract W from f"; return;
            case 0x3B00: this.operandFileOp("SUBWFB", op); this.comment = "Subtract with Borrow W from f"; return;
            case 0x0E00: this.operandFileOp("SWAPF", op); this.comment = "Swap nibbles in f"; return;
            case 0x0600: this.operandFileOp("XORWF", op); this.comment = "Exclusive OR W with f"; return;
            // Byte oriented skip opperations
            case 0x0B00: this.operandFileOp("DECFSZ", op); this.comment = "Decrement f, Skip if 0"; return;
            case 0x0F00: this.operandFileOp("INCFSZ", op); this.comment = "Increment f, Skip if 0"; return;
            //litteral operations
            case 0x3E00: this.operandLiteralOp("ADDLW", (op & 0xFF)); this.comment = "Add literal and W"; return;
            case 0x3900: this.operandLiteralOp("ANDLW", (op & 0xFF)); this.comment = "AND literal with W"; return;
            case 0x3800: this.operandLiteralOp("IORLW", (op & 0xFF)); this.comment = "Inclusive OR literal with W"; return;
            //case 0x0000: return this.operandLiteralOp("MOVLB",(op & 0xFF)) + "; Move literal to BSR"; break;
            case 0x3100:
                if (op & 0x80) {
                    this.operandLiteralOp("MOVLP", (op & 0x7F));
                    this.comment = "Move literal to PCLATH";
                    return;
                }
                break;
            case 0x3000: this.operandLiteralOp("MOVLW", (op & 0xFF)); this.comment = "Move literal to W"; return;
            case 0x3C00: this.operandLiteralOp("SUBLW", (op & 0xFF)); this.comment = "Subtract W from literal"; return;
            case 0x3A00: this.operandLiteralOp("XORLW", (op & 0xFF)); this.comment = "Exclusive OR literal with W"; return;
            case 0x3400: this.operandLiteralOp("RETLW", (op & 0xFF)); this.comment = "Return with literal in W;"; return;
        }
        // bit operations
        switch (op & 0x3C00) {
            case 0x1000: this.operandBitOp("BCF", op); this.comment = "Bit Clear f"; return;
            case 0x1400: this.operandBitOp("BSF", op); this.comment = "Bit Set f"; return;
            case 0x1800: this.operandBitOp("BTFSC", op); this.comment = "Bit Test f, Skip if Clear"; return;
            case 0x1C00: this.operandBitOp("BTFSS", op); this.comment = "Bit Test f, Skip if Set"; return;
        }
        switch (op & 0x3FFF) { // fully decoded ops 
            case 0x000B: this.opcode = "BRW"; this.comment = "Relative Branch with W"; return;
            case 0x000A: this.opcode = "CALLW"; this.comment = "Call Subroutine with W"; return;
            case 0x0008: this.opcode = "RETURN"; this.comment = "Return from Subroutine"; return;
            case 0x0064: this.opcode = "CLRWDT"; this.comment = "Clear Watchdog Timer"; return;
            case 0x0000: this.opcode = "NOP"; this.comment = "No Operation"; return;
            case 0x0062: this.opcode = "OPTION"; this.comment = "Load OPTION_REG register with W"; return;
            case 0x0001: this.opcode = "RESET"; this.comment = "Software device Reset"; return;
            case 0x1063: this.opcode = "SLEEP"; this.comment = "Go into Standby mode"; return;
        }
        // calls and branches
        if ((op & 0x3200) == 0x3200) {
            var offset = (op & 0x1FF) << 23 >> 23;
            this.branchTarget = pc + 1 + offset;
            this.operandLiteralOp("BRA", offset);
            this.comment = "Relative Branch to " + offset;
            return;
        } else if ((op & 0x2000) == 0x2000) {
            if ((op & 0x1000))
            { this.operandLiteralOp("GOTO", this.branchTarget =(op & 0x7FF)); this.comment = "Go to address"; }
            else
            { this.operandLiteralOp("CALL", this.branchTarget =(op & 0x7FF)); this.comment = "Call Subroutine";  }
        }

        // c-compiler optimized, the wierd ones
        //n mm
        else if (((op & 0x18) == 0x18) || ((op & 0x18) == 0x10)) {
            this.isFileOp = false;
            this.opcode = (((op & 0x18) == 0x18) ? "MOVWI" : "MOVIW");
            this.operand = op & 0x7;
            this.comment = this.opcode == "MOVWI" ? "Move W to INDFn" : "Move INDFn to W";
            switch (this.operand) {
                case 0x0: this.operandString= "++INDF0"; this.comment += ", pre inc"; break;
                case 0x1: this.operandString= "--INDF0"; this.comment += ", pre dec"; break;
                case 0x2: this.operandString= "INDF0++"; this.comment += ", post inc"; break;
                case 0x3: this.operandString= "INDF0--"; this.comment += ", post dec"; break;
                case 0x4: this.operandString= "++INDF1"; this.comment += ", pre inc"; break;
                case 0x5: this.operandString= "--INDF1"; this.comment += ", pre dec"; break;
                case 0x6: this.operandString= "INDF1++"; this.comment += ", post inc"; break;
                case 0x7: this.operandString= "INDF1--"; this.comment += ", post dec"; break;
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
        else if ((op & 0x60) == 0x60) {  this.operandLiteralOp("TRIS", (op & 7)); this.comment = "Load TRIS register with W"; }
        if (!this.opcode) { // never decoded
            this.opcode = "ERR";
            this.operand = op;
            this.operandString = '0x' + DISMUtil.hexFormat(op);
        }
    }
    toString(): string {
        var str = DISMUtil.leftJustify(this.opcode, 7);
        if (this.operandString) str += this.operandString;
        if (this.bit!==undefined) str += "," + this.bit;
        else if (this.dist !== undefined) str += "," + this.dist;
        str = DISMUtil.leftJustify(str, 18);
        if (this.comment) str += "; " + this.comment;
        return DISMUtil.listHeader(this.pc, this.op, this.label) + str;
    }
}
 class ControlFlowEdge {
        source: ControlFlowNode;
        target: ControlFlowNode;
        constructor(source: ControlFlowNode, target: ControlFlowNode) {
            this.source = source;
            this.target = target;
        }
        toString() {
            return ':#' + this.target.blockIndex;
        }
}
 class ControlFlowNodeSet {
     nodes: ControlFlowNode[] = [];
     add(n: ControlFlowNode): boolean {
         if (!this.has(n)) return false;
         this.nodes.push(n);
         return true;
     }
     has(n: ControlFlowNode): boolean {
         for (let e of this.nodes) if (e == n) return false;
         return true;
     }
 }

 class ControlFlowNode {
     offset: number;
     visited: boolean;
     blockIndex: number;
     start: PIC16F19X_OPCODE;
     end: PIC16F19X_OPCODE;
     dominanceFrontier: ControlFlowNodeSet;
     immediateDominator: ControlFlowNode;
     dominatorTreeChildren: ControlFlowNode[];
     incomming: ControlFlowEdge[];
     outgoing: ControlFlowEdge[];

     constructor(index: number, offset: number, start?: PIC16F19X_OPCODE, end?: PIC16F19X_OPCODE) {
         this.offset = offset;
         this.blockIndex = index;
         this.start = start;
         this.end = end;
         this.visited = false;
         this.incomming = [];
         this.outgoing = [];
         this.dominatorTreeChildren = [];

     }
     predecessors(): ControlFlowNode[] {
         return this.incomming.map((v) => v.source);
     }
     successors(): ControlFlowNode[]  {
         return this.outgoing.map((v) => v.target);
     }



     traversePreOrder(childrenFunc: (n: ControlFlowNode) => ControlFlowNode[], visitAction: (n: ControlFlowNode) => void) {
         if (this.visited) return;
         this.visited = true;
         visitAction(this);
         var children = childrenFunc(this);
         for (var i in children) children[i].traversePreOrder(childrenFunc, visitAction);

     }
     traversePostOrder(childrenFunc: (n: ControlFlowNode) => ControlFlowNode[], visitAction: (n: ControlFlowNode) => void) {
         if (this.visited) return;
         this.visited = true;
         var children = childrenFunc(this);
         for (var i in children) children[i].traversePreOrder(childrenFunc, visitAction);
         visitAction(this);
     }
     /// <summary>
     /// Gets whether <c>this</c> dominates <paramref name="node"/>.
     /// </summary>
     dominates(node: ControlFlowNode) {
         // TODO: this can be made O(1) by numbering the dominator tree
         var tmp = node;
         while (tmp != null && tmp !== undefined) {
             if (tmp == this) return true;
             tmp = tmp.immediateDominator;
         }
         return false;
     }
     toString() {
         var str = "";
         str = "Block#" + this.blockIndex;
         if(this.offset >=0) str+= " Offset " + this.offset;
         if (this.start) str += ": GM_" + this.start.pc;
         if (this.end) str += " to GM_" + this.end.pc;
         if (this.immediateDominator) {
             str += '\n';
             str += "ImmediateDominator: #" + this.immediateDominator.blockIndex;
         }
         if (this.dominanceFrontier) {
             str += '\n';
             str += "DominanceFrontier: ";
             let slist = [];
             for (let n of this.dominanceFrontier.nodes) {
                 slist.push(n.blockIndex.toString());
             }
             str += slist.sort().join(',');
             //  str += "DominanceFrontier: " + this.dominanceFrontier.sort((a, b) => a.blockIndex - b.blockIndex).map((a) => a.blockIndex.toString()).join(',');
         }
         var inst = this.start;
         while (inst) {
             str += "\n";
             str += "\t" + inst.toString();
             inst = inst.next;
         }
         return str;
     }
 }

 function findCommonDominator(b1: ControlFlowNode, b2: ControlFlowNode): ControlFlowNode {
     // Here we could use the postorder numbers to get rid of the hashset, see "A Simple, Fast Dominance Algorithm"
     let path1 = new ControlFlowNodeSet();
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
     
  
 class ControlFlowGraph {
     entry: ControlFlowNode;
     exit: ControlFlowNode;
     nodes: ControlFlowNode[];
     constructor(nodes: ControlFlowNode[]) {
         this.nodes = nodes;
         this.entry = this.nodes[0];
     }
     resetVisited() {
         for (var i in this.nodes) this.nodes[i].visited = false;
     }
     computeDominance() {
         // A Simple, Fast Dominance Algorithm
         // Keith D. Cooper, Timothy J. Harvey and Ken Kennedy
         var entry = this.entry;
         this.entry.immediateDominator = entry;
         var changed = true;
         while (changed) {
             this.resetVisited();
             this.entry.traversePreOrder(b => b.successors(),
                 b => {
                     if (b != entry) {
                         let pred = b.predecessors();
                         let newIdom;
                         for (let block of pred)
                             if (block.visited && block != b) {
                                 newIdom = block;
                                 break;

                             }
                         // for all other predecessors p of b
                         for (let p of pred) {
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
         for (let node of this.nodes) {
             if (node.immediateDominator !== undefined)
                 node.immediateDominator.dominatorTreeChildren.push(node);
         }
     }
     /// <summary>
     /// Computes dominance frontiers.
     /// This method requires that the dominator tree is already computed!
     /// </summary>
     ComputeDominanceFrontier() {
         this.resetVisited();
         this.entry.traversePostOrder(
             b => b.dominatorTreeChildren,
             n => {
                 //logger.WriteLine("Calculating dominance frontier for " + n.Name);
                 n.dominanceFrontier = new ControlFlowNodeSet();
                 // DF_local computation
                 for (let succ of n.successors()) {
                     if (succ.immediateDominator != n) {
                         //logger.WriteLine("  local: " + succ.Name);
                         n.dominanceFrontier.add(succ);
                     }
                 }
                 // DF_up computation
                 for (let child of n.dominatorTreeChildren) {
                     for (let p of child.dominanceFrontier.nodes) {
                         if (p.immediateDominator != n) {
                             //logger.WriteLine("  DF_up: " + p.Name + " (child=" + child.Name);
                             n.dominanceFrontier.add(p);
                         }
                     }
                 }
             });
     }
 }
 class GraphBuilder {
     M: PIC16F19X_OPCODE[];
     lastInst: PIC16F19X_OPCODE;
     firstInst: PIC16F19X_OPCODE;
     entryPoint: ControlFlowNode;
     regularExit: ControlFlowNode;
     nodes: ControlFlowNode[];
     constructor(M: PIC16F19X_OPCODE[]) {
         this.M = M;
         for (let i of M) {
             if (!i) continue;
             if (i.prev === undefined || i.prev == null) this.firstInst = i;
             if (i.next === undefined || i.next == null) this.lastInst = i;
         }
     }
     createNodeEdge(source: ControlFlowNode, destination: ControlFlowNode) {
         let edge = new ControlFlowEdge(source, destination);
         source.outgoing.push(edge);
         destination.incomming.push(edge);
     }
     createLabelEdge(fromNode: ControlFlowNode, label: string) {
         for (let n of this.nodes) {
             if (n.start.label == label) {
                 this.createNodeEdge(fromNode, n);
                 return;
             }
         }
         throw "Could not find label";
     }
     createInstEdge(fromNode: ControlFlowNode, inst: PIC16F19X_OPCODE) {
         for (let n of this.nodes) {
             if (n.start == inst) {
                 this.createNodeEdge(fromNode, n);
                 return;
             }
         }
         throw "Could not find label";
     }
     nextInstructionEdge(node: ControlFlowNode) {
         if (!node.end.next) this.createNodeEdge(node, this.regularExit);
         else this.createInstEdge(node, node.end.next);
     }
     CreateRegularControlFlow() {
         let last = this.lastInst;
         this.createInstEdge(this.entryPoint, this.firstInst);
         for (let node of this.nodes) {
             //Debug.Assert(node.BlockIndex != 93);
             if (node.end) {
                 var code = node.end;
                 let label = node.end.operandString;
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

     }
     buildGraph(entryLabel: string) {
         let nodes = (this.nodes = []);
         // caculate incomming jump
         let inst = this.firstInst;
         let index = 0;
         let entryPoint = new ControlFlowNode(nodes.length, -1);
         nodes.push(entryPoint);
         let exitPoint = new ControlFlowNode(nodes.length, -1);
         nodes.push(exitPoint);
         this.entryPoint = entryPoint;
         this.regularExit = exitPoint;

         while (inst) {
             let blockStart = inst;
             while ((inst = inst.next)) {
                 if (inst.opcode == "BRA" || inst.opcode == "GOTO" || inst.opcode == "RETURN" || inst.opcode == "RESET") break; // is a branch
                 if (inst.next && inst.next.label !== undefined) break;  // has an incomming jump
             }
             let node = new ControlFlowNode(nodes.length, blockStart.pc, blockStart, inst);
             nodes.push(node);
         }
         if (console) {
             var strl = [];
             for (let n of this.nodes) {
                 strl.push(n.toString());
             }
             var str = strl.join('\n');
             console.log(str);
         }
     //    this.CreateRegularControlFlow();
     }
 }
   
class PIC16F19X_DSAM {
    M: PIC16F19X_OPCODE[];
    decodeRegBits: { [reg: string]: string[] };
    label_count: number;
    output: string;
    labelmap: { [addr: number]: string };
    _hexFormatCache: string[] = []; // use this alot so thought lookups be faster than rebuilding an array and join
    makeLabelsForBranches: boolean;
    setMakeLabelsForBranches(value: boolean) {
        this.makeLabelsForBranches = value;
    }

    getLabel(addr: number, prefix = "L"): string {
        var lbl = this.labelmap[addr];
        if (lbl === undefined) {
            var val = (this.label_count++ & 0xFFFF).toString(16).toUpperCase();
            while (val.length < 4) val = '0' + val;
            this.labelmap[addr] = lbl = prefix + val;
        }
        return lbl;
    }

    constructor() {
        this.label_count = 0;
        this.labelmap = {};
        this.makeLabelsForBranches = true; // default
        var i = 0;
    }
  

 
    doVectorInfo(num: number, addr: number, vname: string): string {
        this.labelmap[addr] = "V" + vname;
        this.labelmap[num] = vname;// create the labels here
        this.label_count += 2;
        return DISMUtil.listHeader(addr, num, vname)  + "; " +vname + " VECTOR: " + DISMUtil.hexFormat(num, 2) + "\n";
    }
    private if1BitThenOut(flag:number,bit: number, name: string, yes: string, no: string) {
        var b = (flag >> bit) & 1;
        var str = "; " + name + "=" + b;
        str = DISMUtil.leftJustify(str, 13);
        return str + ": " + (b!=0 ? yes : no);
    }
    private if1BitThenOut4(flag: number,bit: number, name: string, list: string[]) {
        var mask = (1 << bit) | (1 << (bit + 1));
        var what = (flag & mask) >>> bit;
        var str = "; " + name + "=" + what;
        str = DISMUtil.leftJustify(str, 13);
        return str + ": " + list[what];
    }
    private outputconfig2(flag1: number, flag2: number): string {
        if (flag2 === undefined) return "";
        var head = DISMUtil.listHeader(0x8008, flag2);
        var str = "";
        str += head + this.if1BitThenOut(flag2,13, "LVP", "Low-voltage programming enabled", "High-voltage on MCLR/VPP must be used for programming") + "\n";
        str += head + this.if1BitThenOut(flag2,12, "DEBUG", "In-Circuit Debugger disabled, RB6/ICSPCLK and RB7/ICSPDAT are general purpose I/O pins", "In-Circuit Debugger enabled, RB6/ICSPCLK and RB7/ICSPDAT are dedicated to the debugger") + "\n";
        str += head + this.if1BitThenOut(flag2,10, "BORV", "Brown-out Reset voltage set to 1.9V", "Brown-out Reset voltage set to 2.5V") + "\n";
        str += head + this.if1BitThenOut(flag2,9, "STVREN", "Stack Overflow or Underflow will cause a Reset", "Stack Overflow or Underflow will not cause a Reset") + "\n";
        str += head + this.if1BitThenOut(flag2,8, "PLLEN", "4xPLL enabled", "4xPLL disabled") + "\n";
        str += head + this.if1BitThenOut4(flag2,4, "VCAPEN", ["VCAP functionality is enabled on RA0", "VCAP functionality is enabled on RA5", "VCAP functionality is enabled on RA6", "No capacitor on VCAP pin"]) + "\n";
        // Since I am only doing the PIC 16F1933, then this is limited
        str += head + this.if1BitThenOut4(flag2,4, "WRT", ["000h to FFFh write-protected", "000h to 7FFh write-protected", "000h to 1FFh write-protected", "Write protection off"]) + "\n";
        return str;
    } 
    private outputconfig1(flag1: number, flag2: number) :string {
        if (flag1 === undefined) return "";
        var head = DISMUtil.listHeader(0x8007, flag1);
        var str = "";
        str += head + this.if1BitThenOut(flag1, 13, "FCMEM", "Fail-Safe Clock Monitor is enabled;", "Fail-Safe Clock Monitor is disabled") + "\n"; 
        str += head + this.if1BitThenOut(flag1,12, "IESO", "Internal/External Switchover mode is enabled", "Internal/External Switchover mode is disabled") + "\n";
        str += head + this.if1BitThenOut(flag1,11, "CLKOUTEN", "CLKOUT function is disabled. I/O or oscillator function on RA6/CLKOUT", "CLKOUT function is enabled on RA6/CLKOUT") + "\n";
        str += head + this.if1BitThenOut4(flag1,9, "BOREN", ["BOR disabled", "BOR controlled by SBOREN bit of the PCON register", "BOR enabled during operation and disabled in Sleep", "BOR enabled" ]) + "\n";
        str += head + this.if1BitThenOut(flag1,8, "CPD", "Data memory code protection is disabled", "Data memory code protection is enabled") + "\n";
        str += head + this.if1BitThenOut(flag1,7, "CP", "Program memory code protection is disabled", "Program memory code protection is enabled") + "\n";
        if (!(flag2 & (1 << 13))) str += head + this.if1BitThenOut(flag1,6, "MCLRE", "RE3/MCLR/VPP pin function is MCLR; Weak pull-up enabled.", "RE3/MCLR/VPP pin function is digital input; MCLR internally disabled; Weak pull-up under control of WPUE3") + "\n";


        str += head + this.if1BitThenOut(flag1,5, "PWRTE", "PWRT disabled", "PWRT enabled") + "\n";
        str += head + this.if1BitThenOut4(flag1,3, "WDTE", ["WDT disabled", "WDT controlled by the SWDTEN bit in the WDTCON register", "WDT enabled while running and disabled in Sleep", "WDT enabled"]) + "\n";
        str += head + DISMUtil.leftJustify("; FOSC=" + (flag1 & 0x3), 13) + ": ";
        switch (flag1 & 0x3) {
            case 7: str += "ECH: External Clock, High - Power mode: CLKIN on RA7/ OSC1 / CLKIN"; break;
            case 6: str += "ECM: External Clock, Medium - Power mode: CLKIN on RA7/ OSC1 / CLKIN"; break;
            case 5: str += "ECL: External Clock, Low - Power mode: CLKIN on RA7/ OSC1 / CLKIN"; break;
            case 4: str += "INTOSC oscillator: I / O function on RA7/ OSC1 / CLKIN"; break;
            case 3: str += "EXTRC oscillator: RC function on RA7/ OSC1 / CLKIN"; break;
            case 2: str += "HS oscillator: High - speed crystal/ resonator on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN"; break;
            case 1: str += "XT oscillator: Crystal / resonator on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN"; break;
            case 0: str += "LP oscillator: Low - power crystal on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN"; break;
        }
        str += "\n";
        return str;
    }

    // attempt to convert the comments to something easyer to read
    basicDecode() {
      // let graph = new GraphBuilder(this.M);  
      //  graph.buildGraph(this.M[0].label);
        let M = this.M;
        let bank = 0;
        for (let i = 0; i < M.length; i++) {
            let current = M[i];
            let next = M[i + 1];
            switch (current.opcode) {
                case "MOVLB":
                    if (next && next.opcode == "MOVLB" && !next.label) {
                        current.comment = null;
                        next.comment = "BANK=" + next.operand;
                        i++; // we have a double move, make sure next 
                        
                    } else
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
                    } else
                        current.comment = "if " + current.operandString + "(" + current.bit + ") then skip";
                    break;
                case "BTFSC":
                    if (next && next.opcode == "BRA" || next.opcode == "CALL" || next.opcode == "GOTO") {
                        var str = next.opcode == "CALL" ? ") call " : ") goto ";
                        current.comment = "if " + current.operandString + "(" + current.bit + str + next.operandString;
                        next.comment = null;
                    } else
                        current.comment = "if !" + current.operandString + "(" + current.bit + ") then skip";
                    break;
                case "MOVLW":
                    if (next && next.opcode == "MOVWF") { // Move literal to W
                        current.comment = null;
                        next.comment = next.operandString + "=" + current.operandString;
                        i++;
                    }
                    break;
            }
        }
   //     0006 300F         MOVLW  0x0F       ; Move literal to W
     //   0007 0097         MOVWF  WDTCON, f; Move W to f
    }
    dismw(mem : number[]): string {
        this.label_count = 0;
        this.labelmap = {};
        var str = "";
        this.M = [];
        var guessBSR = 0;
        // pass 1, get all labels
        var prev: PIC16F19X_OPCODE = null;
        for (var i = 0; i < mem.length; i++) {
            var op = mem[i];
            var o: PIC16F19X_OPCODE = undefined;
            
            if (op !== undefined && op != -1) {
                o = new PIC16F19X_OPCODE(i, op);
                // set up a linked list
                o.prev = prev;
                o.next = null;
                if (prev != null) prev.next = o;
                prev = o;

                if (o.branchTarget !== undefined) {
                    var lbl = this.getLabel(o.branchTarget);
                    o.operandString = lbl;
                } else if (o.isFileOp) { // try to guess regester from bsr
                    o.operandString = DISMUtil.formatReg(o.operand, guessBSR);
                } else {
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
        for (let o of this.M) {
            var lbl = this.labelmap[o.pc];
            if (lbl !== undefined) o.label = lbl;
            str += o.toString() + "\n";
        }
 
        str+= this.outputconfig1(mem[0x8007], mem[0x8008]);
        str += this.outputconfig2(mem[0x8007], mem[0x8008]);
        
        return str;
    }
    disam(R: IHEXFILE): string {
        return this.dismw(R.W);

    }
}