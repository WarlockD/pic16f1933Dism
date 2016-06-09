using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace pic16f19x
{
    public static class StringBuilderExtensions
    {
        public static void LeftJustify(this StringBuilder sb, string word, int count)
        {
            int len = sb.Length + count;
            sb.Append(word);
            if (len > sb.Length) sb.Append(' ', len - sb.Length);
        }
        public static void LeftJustify(this StringBuilder sb, int count)
        {
            if (count > sb.Length) sb.Append(' ', count - sb.Length);
        }
        public static void AppendListHeader(this StringBuilder sb, int pc, int op, Label label = null)
        {
            sb.AppendFormat("{0:X4} {1:X4} ", pc, op);
            if (label == null) sb.Append("      ");
            else sb.AppendFormat("{0,-6}", label.Name);
        }

        // just LOVE extenions methods
        public static Label GetLabel(this Dictionary<int, Label> labels, int address)
        {
            if (address < 0 || address > 0x7FF) throw new ArgumentException("address out of range", "address");
            Label l;
            if (!labels.TryGetValue(address, out l)) labels.Add(address, l = new Label(address));
            return l;
        }
        public static void DebugSave(this List<Instruction> list, string filename)
        {
            using (StreamWriter sw = new StreamWriter(filename))
                foreach (var i in list) sw.WriteLine(i.ToString());
        }
    }
    public enum Opcode : int
    {
        ERR = -1,
        ADDRWF,
        ADDFSR,
        ADDWFC,
        ANDWF,
        ASRF,
        LSLF,
        LSRF,
        CLRF,
        CLRW,
        COMF,
        DECF,
        INCF,
        IORWF,
        MOVF,
        MOVWF,
        MOVLB,
        RLF,
        RRF,
        SUBWF,
        SUBWFB,
        SWAPF,
        XORWF,
        DECFSZ,
        INCFSZ,
        ADDLW,
        ANDLW,
        IORLW,
        MOVLW,
        SUBLW,
        XORLW,
        RETLW,
        BCF,
        BSF,
        BTFSC,
        BTFSS,
        BRW,
        CALLW,
        RETURN,
        CLRWDT,
        NOP,
        OPTION,
        RESET,
        SLEEP,
        BRA,
        MOVWI,
        MOVIW,
        TRIS,
        MOVLP,
        GOTO,
        CALL,
        RETFIE,
        // virtual instructions, filler
        Data,// empty instruction, just has a comment maybe with no operands or opcodes
        Switch, // helper for detecting switch/case
    }
    public enum OperandType
    {
        None, File, Bit, Literal, Fsr
    }
    public class Instruction
    {
        public Label[] Labels = null; // for switch case
        public int BSR = -1; // caculated bsr
        public bool visited = false; // used to see if this is reached or not
        public Label Label = null;
        public ushort Raw;
        public ushort Address;
        public Opcode Opcode;
        public OperandType Type;
        public int Operand;
        public string OperandString = null;  // Can be label or regester lookup
        public string OperandDist = null;
        public string Comment = null;
        public Label BranchLabel = null; // Decoded branch address, usally from BRA, but its always PC+1+
        public byte RegBit { get { return (byte) ((Raw >> 7) & 7); } }


        void SetFileOperation(Opcode code, ushort op, string comment = null)
        {
            this.Opcode = code;
            this.Operand = op & 0x7F;
            this.OperandString = IncludeFile.GetReg(this.Operand);
            this.Type = OperandType.File;
            this.OperandDist = ((op & 0x80) == 128) ? "f" : "w";
            this.Comment = comment;
        }
        void SetBitOperation(Opcode code, ushort op, string comment = null)
        {
            this.Opcode = code;
            this.Operand = op & 0x7F;
            this.OperandString = IncludeFile.GetReg(this.Operand);
            this.Type = OperandType.Bit;
            this.OperandDist = RegBit.ToString();
            this.Comment = comment;
        }
        void SetLiteralOperation(Opcode code, int operand, string comment = null)
        {
            this.Opcode = code;
            this.Operand = operand;
            if (operand > -10 && operand < 10) this.OperandString = operand.ToString();
            else if ((operand & 0xFF) == operand) this.OperandString = "0x" + operand.ToString("X2");
            else this.OperandString = "0x" + operand.ToString("X4");
            this.Type = OperandType.Literal;
            this.Comment = comment;
        }
        private Instruction() { }
        public static Instruction MakeData(ushort pc, int data, string comment = null)
        {
            Instruction i = new Instruction();
            i.Type = OperandType.None;
            i.Address = pc;
            i.Opcode = Opcode.Data;
            i.Raw = (ushort) data;
            i.Comment = comment;
            return i;
        }
        public bool isSkip
        {
            get
            {
                switch (Opcode)
                {
                    case Opcode.DECFSZ:
                    case Opcode.INCFSZ:
                    case Opcode.BCF:
                    case Opcode.BSF:
                    case Opcode.BTFSC:
                    case Opcode.BTFSS:
                        return true;
                    default:
                        return false;

                }
            }
        }
        public bool isBranch // We don't NEED an address, just we jump somewhere else using this command
        {
            get
            {

                // I should check bit operations but thats just too silly.  Why the hell would anyone modify PCL with that as it wll
                // take two cycles vs using BRA
                switch (Opcode)
                {
                    case Opcode.BRW:
                    case Opcode.RETFIE:
                    case Opcode.RETLW:
                    case Opcode.CALLW:
                    case Opcode.RETURN:
                    case Opcode.RESET:
                    case Opcode.SLEEP:
                    case Opcode.GOTO:
                    case Opcode.CALL:
                    case Opcode.BRA:
                    case Opcode.MOVLP: // literal to pclath
                        return true;
                    default:
                        if (Type == OperandType.File && this.OperandDist == "f" && (this.Operand == 2 || this.Operand == 0xA))
                            return true; // moving to PCL or PCLATH
                        else
                            return false;

                }
            }
        }

        static Dictionary<ushort, Dictionary<ushort, Action<Instruction>>> resolver = new Dictionary<ushort, Dictionary<ushort, Action<Instruction>>>();

        static void AddResolver(ushort mask, ushort op, Action<Instruction> func)
        {
            Dictionary<ushort, Action<Instruction>> maskDic;
            if (!resolver.TryGetValue(mask, out maskDic)) resolver.Add(mask, maskDic = new Dictionary<ushort, Action<Instruction>>());
            maskDic.Add(op, func);
        }
        public static Instruction Dissasemble(ushort pc, ushort op)
        {
            foreach (var kv in resolver)
            {
                ushort masked = (ushort) (op & kv.Key);
                Action<Instruction> func;
                if (kv.Value.TryGetValue(masked, out func))
                {
                    Instruction inst = new Instruction() { Raw = op, Address = pc, Opcode = Opcode.ERR , Type = OperandType.None , OperandString = null, Operand = int.MinValue };
                    func(inst);
                    return inst;
                }
            }
            // bad instruction?
            throw new Exception("Bad instruction");
        }
        static Instruction()
        {
            AddResolver(0x3800, 0x2000, (Instruction i) => i.SetLiteralOperation(Opcode.CALL, (i.Raw & 0x7FF), "Call Subroutine"));
            AddResolver(0x3800, 0x2800, (Instruction i) => i.SetLiteralOperation(Opcode.GOTO, (i.Raw & 0x7FF), "Go to address"));
        }
        public Instruction(ushort pc, ushort op, Dictionary<int, Label> labels = null)
        {
            // Refactored ALL of this.  I was sick and tired of doing these one off masks so just masking eveything 
            // into switch statments.  Boy this works much MUCH better
            this.Opcode = Opcode.ERR;
            this.Address = pc;
            this.Raw = op;
            this.Type = OperandType.None;
            this.OperandString = null;
            this.Operand = int.MinValue;

            // call and goto
            switch(op & 0x3800)
            {
                case 0x2000:
                case 0x2800:
                    this.BranchLabel = labels == null ? new Label(op & 0x7FF) : labels.GetLabel(op & 0x7FF);
                    this.BranchLabel.CallsTo.Add(this);
                    if ((op & 0x3800) == 0x2800)
                        { this.SetLiteralOperation(Opcode.GOTO, (op & 0x7FF), "Go to address"); }
                    else
                        { this.SetLiteralOperation(Opcode.CALL, (op & 0x7FF), "Call Subroutine"); }
                    return;
            }

            // Opcode only
            switch (op & 0x3FFF)
            { // fully decoded ops 
                case 0x000B: this.Opcode = Opcode.BRW; this.Comment = "Relative Branch with W"; return;
                case 0x000A: this.Opcode = Opcode.CALLW; this.Comment = "Call Subroutine with W"; return;
                case 0x0008: this.Opcode = Opcode.RETURN; this.Comment = "Return from Subroutine"; return;
                case 0x0009: this.Opcode = Opcode.RETFIE; this.Comment = "Return from interrupt"; return;
                case 0x0064: this.Opcode = Opcode.CLRWDT; this.Comment = "Clear Watchdog Timer"; return;
                case 0x0000: this.Opcode = Opcode.NOP; this.Comment = "No Operation"; return;
                case 0x0062: this.Opcode = Opcode.OPTION; this.Comment = "Load OPTION_REG register with W"; return;
                case 0x0001: this.Opcode = Opcode.RESET; this.Comment = "Software device Reset"; return;
                case 0x1063: this.Opcode = Opcode.SLEEP; this.Comment = "Go into Standby mode"; return;
                    // don't care about the last 7 bits?  The datasheet says the last 7 bits can be anything 
                    // (I think its because this is the same format as CLRF) but in practical sence its always 0?
                case 0x0103: this.Opcode = Opcode.CLRW; this.Comment = "Clear f"; return;
            }
            // Clear F and movewf mask
            switch(op & 0x3F80)
            {
                case 0x0080: this.SetFileOperation(Opcode.MOVWF, op, "Move W to f"); this.OperandDist = null;  return; // don't need the dist here
                case 0x0180: this.SetFileOperation(Opcode.CLRF, op, "Clear f"); return;
                case 0x3180: this.SetLiteralOperation(Opcode.MOVLP, (op & 0x7F), "Move literal to PCLATH"); return;
                case 0x3100:
                    this.Opcode = Opcode.ADDFSR;
                    this.OperandString = (0x40 & op) != 0 ? "INDF1" : "INDF0";
                    this.Operand = op & 0x3F;
                    this.OperandDist = "0x" + this.Operand.ToString("X2");
                    this.Type = OperandType.Fsr;
                    break;
                case 0x3F00:
                case 0x3F80:
                    this.Opcode = ((op & 0x3f80) == 0x3F80) ? Opcode.MOVWI : Opcode.MOVIW;
                    this.Operand = (op & 0x3F) << 26 >> 26;
                    this.Comment = this.Opcode == Opcode.MOVWI ? "Move W to INDF" + this.Operand + ", Indexed Indirect." : "Move INDF" + ((0x40 & op) != 0 ? "1" : "0") + " to W, Indexed Indirect.";
                    this.OperandDist = (0x40 & op) != 0 ? "[INDF1]" : "[INDF0]";
                    this.OperandString = this.Operand + this.OperandDist;
                    this.Type = OperandType.Fsr;
                    return;
            }
            //Compiler c stuff and TRIS... is TRIS still a thing?
            switch(op & 0x3FF8)
            {
                case 0x0060: this.SetLiteralOperation(Opcode.TRIS, (op & 7), "Load TRIS register with W"); return;
                case 0x0010: // MOVIW
                case 0x0018: // MOVWI
                    this.Opcode = ((op & 0x18) == 0x18) ? Opcode.MOVWI : Opcode.MOVIW;
                    this.Operand = op & 0x7;
                    if (this.Opcode == Opcode.MOVWI)
                        this.Comment = "Move W to INDF" + ((0x4 & op) != 0 ? "1" : "0");
                    else
                        this.Comment = "Move INDF" + ((0x4 & op) != 0 ? "1" : "0") + " to W";
                    this.Type = OperandType.Fsr;
                    switch (this.Operand)
                    {
                        case 0x0: this.OperandString = "++INDF0"; this.Comment += ", pre inc"; break;
                        case 0x1: this.OperandString = "--INDF0"; this.Comment += ", pre dec"; break;
                        case 0x2: this.OperandString = "INDF0++"; this.Comment += ", post inc"; break;
                        case 0x3: this.OperandString = "INDF0--"; this.Comment += ", post dec"; break;
                        case 0x4: this.OperandString = "++INDF1"; this.Comment += ", pre inc"; break;
                        case 0x5: this.OperandString = "--INDF1"; this.Comment += ", pre dec"; break;
                        case 0x6: this.OperandString = "INDF1++"; this.Comment += ", post inc"; break;
                        case 0x7: this.OperandString = "INDF1--"; this.Comment += ", post dec"; break;
                    }
                    return;
            }
            // Special mas for lb meh
            switch (op & 0x3FE0)
            {
                case 0x0020: this.SetLiteralOperation(Opcode.MOVLB, (op & 0x1F), "Move literal to BSR"); return;
            }
            // Litteral operations, mostly
            switch (op & 0x3E00)
            {
                // Its funny when you look at this.  Microchip tried SO hard to make their stuff backward compatable
                // they have to do funkey things with the operations so that when they DID decide to add a literal add
                // operation, it has to use the same bit mask as BRA:P
                case 0x3E00: this.SetLiteralOperation(Opcode.ADDLW, (op & 0xFF), "Add literal and W"); return;
                case 0x3C00: this.SetLiteralOperation(Opcode.SUBLW, (op & 0xFF), "Subtract W from literal"); return;
                case 0x3200:
                    int offset = (((int) op & 0x1FF) << 23) >> 23;
                    int address = (pc + 1 + offset) & 0x7FF;
                    this.BranchLabel = labels == null ? new Label(address) : labels.GetLabel(address);
                    this.BranchLabel.CallsTo.Add(this);
                    this.SetLiteralOperation(Opcode.BRA, offset, "Relative Branch to " + offset);
                    this.OperandString = offset.ToString();
                    return;
               

            }
            // File operations
            switch (op & 0x3F00)
            {
                case 0x0700: this.SetFileOperation(Opcode.ADDRWF, op, "Add W and f"); return;
                case 0x3900: this.SetLiteralOperation(Opcode.ANDLW, (op & 0xFF), "AND literal with W"); return;
                case 0x0500: this.SetFileOperation(Opcode.ANDWF, op, "AND W with f"); return;
                case 0x0900: this.SetFileOperation(Opcode.COMF, op, "Complement f"); return;
                case 0x0300: this.SetFileOperation(Opcode.DECF, op, "Decrement f"); return;
                case 0x0B00: this.SetFileOperation(Opcode.DECFSZ, op, "Decrement f, Skip if 0"); return;
                case 0x0A00: this.SetFileOperation(Opcode.INCF, op, "Increment f"); return;
                case 0x0F00: this.SetFileOperation(Opcode.INCFSZ, op, "Increment f, Skip if 0"); return;
                case 0x3800: this.SetLiteralOperation(Opcode.IORLW, (op & 0xFF), "Inclusive OR literal with W"); return;
                case 0x0400: this.SetFileOperation(Opcode.XORWF, op, "Exclusive OR W with f"); return;
                case 0x0800: this.SetFileOperation(Opcode.MOVF, op, "Move f"); return;
                case 0x0D00: this.SetFileOperation(Opcode.RLF, op, "Rotate Left f through Carry"); return;
                case 0x0C00: this.SetFileOperation(Opcode.RRF, op, "Rotate Right f through Carry"); return;
                case 0x0200: this.SetFileOperation(Opcode.SUBWF, op, "Subtract W from f"); return;
                case 0x0E00: this.SetFileOperation(Opcode.SWAPF, op, "Swap nibbles in f"); return;
                case 0x3A00: this.SetLiteralOperation(Opcode.XORLW, (op & 0xFF), "Exclusive OR literal with W"); return;
                case 0x0600: this.SetFileOperation(Opcode.XORWF, op, "Exclusive OR literal with W"); return;
                case 0x3D00: this.SetFileOperation(Opcode.ADDWFC, op, "Add with Carry W and f"); return;
                case 0x3700: this.SetFileOperation(Opcode.ASRF, op, "Arithmetic Right Shift"); return;
                case 0x3500: this.SetFileOperation(Opcode.LSLF, op, "Logical Left Shift"); return;
                case 0x3600: this.SetFileOperation(Opcode.LSRF, op, "Logical Right Shift"); return;
                case 0x3B00: this.SetFileOperation(Opcode.SUBWFB, op, "Subtract with Borrow W from f"); return;
               
            }
            // bit operations
            switch (op & 0x3C00)
            {
                case 0x3400: this.SetLiteralOperation(Opcode.RETLW, (op & 0xFF), "Return with literal in W;"); return;
                case 0x3000: this.SetLiteralOperation(Opcode.MOVLW, (op & 0xFF), "Move literal to W"); return;
                case 0x1000: this.SetBitOperation(Opcode.BCF, op, "Bit Clear f"); return;
                case 0x1400: this.SetBitOperation(Opcode.BSF, op, "Bit Set f"); return;
                case 0x1800: this.SetBitOperation(Opcode.BTFSC, op, "Bit Test f, Skip if Clear"); return;
                case 0x1C00: this.SetBitOperation(Opcode.BTFSS, op, "Bit Test f, Skip if Set"); return;
            }
            Debug.Assert(false);
        }

        public void ToStringBuilder(StringBuilder sb)
        {
            sb.AppendListHeader(this.Address, this.Raw, this.Label);
            if (Opcode != Opcode.Data)
                sb.LeftJustify(Opcode.ToString(), 7);
            else
                sb.Append(' ', 7);
            if (Type != OperandType.None)
            {
                if (this.BranchLabel != null)
                    sb.Append(this.BranchLabel.Name);
                else if (this.OperandString != null)
                    sb.Append(this.OperandString);
               else
                {// operand string should always be set but in case its not
                    sb.Append('?');
                    sb.Append(this.Operand.ToString());
                    sb.Append('?');
                }
                if (Type != OperandType.Fsr && this.OperandDist != null)
                {
                    sb.Append(',');
                    sb.Append(OperandDist);
                }
            }
            sb.LeftJustify(40); // left justify the string to 18
            if (this.Comment != null)
            {
                sb.Append("; ");
                sb.Append(this.Comment);
            }

        }
        public override string ToString()
        {
            StringBuilder sb = new StringBuilder(20);
            ToStringBuilder(sb);
            return sb.ToString();
        }
    }
    public class Label : IEquatable<Label>
    {
        public readonly ushort Address;
        public readonly string Name;
        public List<Instruction> CallsTo = new List<Instruction>();
        public Label(int address)
        {
            this.Address = (ushort) address;
            this.Name = "L" + this.Address.ToString("X3");
        }
        public override int GetHashCode()
        {
            return Address;
        }
        public override string ToString()
        {
            return this.Name;
        }

        public bool Equals(Label other)
        {
            return Address == other.Address;
        }
    }
    public class Dsam
    {

        List<Instruction> instructions = new List<Instruction>();
        Dictionary<int, Label> labels = new Dictionary<int, Label>();
        public IReadOnlyList<Instruction> Instructions { get { return instructions; } }
        public IReadOnlyDictionary<int, Label> Labels { get { return labels; } }
        PlainTextWriter writer;
        Label GetLabel(int address)
        {
            Label l;
            if (!labels.TryGetValue(address, out l)) labels.Add(address, l = new Label(address));
            return l;
        }
        Instruction IfBit1ThenOut(int address, int flag, int bit, string name, string yes, string no)
        {
            Instruction i = Instruction.MakeData((ushort) address, flag);
            StringBuilder sb = new StringBuilder(20);
            int b = (flag >> bit) & 1;
            sb.Append(name);
            sb.Append('=');
            sb.Append(b);
            sb.LeftJustify(13);
            sb.Append(": ");
            sb.Append(b != 0 ? yes : no);
            i.Comment = sb.ToString();
            return i;
        }
        Instruction IfBit4ThenOut(int address, int flag, int bit, string name, params string[] list)
        {
            Instruction i = Instruction.MakeData((ushort) address, flag);
            StringBuilder sb = new StringBuilder(20);
            int mask = (1 << bit) | (1 << (bit + 1));
            int what = (int) (((uint) flag & (uint) mask) >> bit);
            sb.Append("; ");
            sb.Append(name);
            sb.Append('=');
            sb.Append(what);
            sb.LeftJustify(13);
            sb.Append(": ");
            sb.Append(list[what]);
            i.Comment = sb.ToString();
            return i;
        }
        void OutPutConfig2(ushort flag1, ushort flag2)
        {
            instructions.Add(IfBit1ThenOut(0x8008, flag2, 13, "LVP", "Low-voltage programming enabled", "High-voltage on MCLR/VPP must be used for programming"));
            instructions.Add(IfBit1ThenOut(0x8008, flag2, 12, "DEBUG", "In-Circuit Debugger disabled, RB6/ICSPCLK and RB7/ICSPDAT are general purpose I/O pins", "In-Circuit Debugger enabled, RB6/ICSPCLK and RB7/ICSPDAT are dedicated to the debugger"));
            instructions.Add(IfBit1ThenOut(0x8008, flag2, 10, "BORV", "Brown-out Reset voltage set to 1.9V", "Brown-out Reset voltage set to 2.5V"));
            instructions.Add(IfBit1ThenOut(0x8008, flag2, 9, "STVREN", "Stack Overflow or Underflow will cause a Reset", "Stack Overflow or Underflow will not cause a Reset"));
            instructions.Add(IfBit1ThenOut(0x8008, flag2, 8, "PLLEN", "4xPLL enabled", "4xPLL disabled"));
            instructions.Add(IfBit4ThenOut(0x8008, flag2, 4, "VCAPEN", "VCAP functionality is enabled on RA0", "VCAP functionality is enabled on RA5", "VCAP functionality is enabled on RA6", "No capacitor on VCAP pin"));
            // Since I am only doing the PIC 16F1933, then this is limited
            instructions.Add(IfBit4ThenOut(0x8008, flag2, 4, "WRT", "000h to FFFh write-protected", "000h to 7FFh write-protected", "000h to 1FFh write-protected", "Write protection off"));
        }
        void OutPutConfig1(ushort flag1, ushort flag2)
        {
            instructions.Add(IfBit1ThenOut(0x8007, flag1, 13, "FCMEM", "Fail-Safe Clock Monitor is enabled;", "Fail-Safe Clock Monitor is disabled"));
            instructions.Add(IfBit1ThenOut(0x8007, flag1, 12, "IESO", "Internal/External Switchover mode is enabled", "Internal/External Switchover mode is disabled"));
            instructions.Add(IfBit1ThenOut(0x8007, flag1, 11, "CLKOUTEN", "CLKOUT function is disabled. I/O or oscillator function on RA6/CLKOUT", "CLKOUT function is enabled on RA6/CLKOUT"));
            instructions.Add(IfBit4ThenOut(0x8007, flag1, 9, "BOREN", "BOR disabled", "BOR controlled by SBOREN bit of the PCON register", "BOR enabled during operation and disabled in Sleep", "BOR enabled"));
            instructions.Add(IfBit1ThenOut(0x8007, flag1, 8, "CPD", "Data memory code protection is disabled", "Data memory code protection is enabled"));
            instructions.Add(IfBit1ThenOut(0x8007, flag1, 7, "CP", "Program memory code protection is disabled", "Program memory code protection is enabled"));
            if ((flag2 & (1 << 13)) == 0) instructions.Add(IfBit1ThenOut(0x8007, flag1, 6, "MCLRE", "RE3/MCLR/VPP pin function is MCLR; Weak pull-up enabled.", "RE3/MCLR/VPP pin function is digital input; MCLR internally disabled; Weak pull-up under control of WPUE3"));


            instructions.Add(IfBit1ThenOut(0x8007, flag1, 5, "PWRTE", "PWRT disabled", "PWRT enabled"));
            instructions.Add(IfBit4ThenOut(0x8007, flag1, 3, "WDTE", "WDT disabled", "WDT controlled by the SWDTEN bit in the WDTCON register", "WDT enabled while running and disabled in Sleep", "WDT enabled"));
            Instruction clock = Instruction.MakeData(0x8007, flag1);
            switch (flag1 & 0x3)
            {
                case 7: clock.Comment = "FOSC=7: ECH: External Clock, High - Power mode: CLKIN on RA7/ OSC1 / CLKIN"; break;
                case 6: clock.Comment = "FOSC=6: ECM: External Clock, Medium - Power mode: CLKIN on RA7/ OSC1 / CLKIN"; break;
                case 5: clock.Comment = "FOSC=5: ECL: External Clock, Low - Power mode: CLKIN on RA7/ OSC1 / CLKIN"; break;
                case 4: clock.Comment = "FOSC=4: INTOSC oscillator: I / O function on RA7/ OSC1 / CLKIN"; break;
                case 3: clock.Comment = "FOSC=3: EXTRC oscillator: RC function on RA7/ OSC1 / CLKIN"; break;
                case 2: clock.Comment = "FOSC=2: HS oscillator: High - speed crystal/ resonator on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN"; break;
                case 1: clock.Comment = "FOSC=1: XT oscillator: Crystal / resonator on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN"; break;
                case 0: clock.Comment = "FOSC=0: LP oscillator: Low - power crystal on RA6/ OSC2 / CLKOUT pin and RA7/ OSC1 / CLKIN"; break;
            }
            instructions.Add(clock);
        }
        public struct Info : IComparable<Info>
        {
            public ushort Address;
            public ushort Data;

            public int CompareTo(Info other)
            {
                return Address.CompareTo(other.Address);
            }
        }

        IEnumerable<Info> FromBinFile(string filename, bool byteSwap, ushort offset = 0)
        {
            using (FileStream fs = new FileStream(filename, FileMode.Open))
            {
                while (fs.Position < fs.Length)
                {
                    int b1 = fs.ReadByte();
                    int b2 = fs.ReadByte();
                    if (b1 == -1) break;
                    if (b2 == -1) throw new IOException("File has uneven bytes");
                    Info i = new Info() { Address = offset, Data = (ushort) (byteSwap ? b1 | (b2 << 8) : b2 | (b1 << 8)) };
                    yield return i;
                    offset++;
                }
            }
        }
        IEnumerable<Info> FromHexFile(string filename, bool byteSwap)
        {
            using (FileStream fs = new FileStream(filename, FileMode.Open))
            {
                HexFile file = new HexFile(fs, byteSwap);
                foreach (var word in file.Words)
                {
                    yield return new Info() { Address = (ushort) word.Key, Data = (ushort) word.Value };
                }
            }
        }
        IEnumerable<Info> FromFile(string filename)
        {
            string ext = Path.GetExtension(filename).ToLower();

            if (ext == ".hex") return FromHexFile(filename, true);
            else if (ext == ".bin") return FromBinFile(filename, false);
            else return FromBinFile(filename, false);
        }
        public string DoAssign(string regName, int value, string valueString)
        {
            string ret= regName + "=";
            List<string> flags = IncludeFile.GetSetFlags(regName, value).ToList();
            if (value == 0 || flags.Count == 0) return regName + "=" + valueString;
            else
            {
                StringBuilder sb = new StringBuilder();
                sb.Append(regName);
                sb.Append("=");
                sb.Append(valueString);
                sb.Append(" (");
                for (int i = 0; i < flags.Count; i++)
                {
                    if (i != 0) sb.Append('|');
                    sb.Append(flags[i]);
                }
                sb.Append(")");
                return sb.ToString();
            }
        }
        public int Analyze(int pos)
        {
            var current = instructions[pos];
            var next = instructions.ElementAtOrDefault(pos + 1);
            switch (current.Opcode)
            {
                case Opcode.MOVLB:
                    if (next.Opcode == Opcode.MOVLB && next.Label == null)// double LB?  This a macro?
                    {
                        current.Comment = null;
                        next.Comment = "BSR=" + next.Operand;
                        pos++; // we have a double move, make sure next
                    }
                    else current.Comment = "BSR=" + current.Operand;
                    break;
                case Opcode.MOVF:
                    if (current.OperandDist == "w" && next.Opcode == Opcode.MOVWF && next.Label == null)
                    {
                        current.Comment = null;
                        next.Comment = DoAssign(next.OperandString, current.Operand,current.OperandString);
                        pos++;
                    }
                    else current.Comment = "W=" + current.OperandString;

                    break;
                case Opcode.MOVLW:
                    if (next.Opcode == Opcode.MOVWF)
                    { // Move literal to W
                        current.Comment = null;
                        next.Comment = DoAssign(next.OperandString, current.Operand, current.OperandString);//     next.OperandString + "=" + current.OperandString;
                        pos++;
                    }
                    else current.Comment = "W=" + current.OperandString;
                    break;
                case Opcode.CLRF:
                    current.Comment = current.OperandString + " = 0";
                    break;
                case Opcode.BCF:
                    current.Comment = current.OperandString + "(" + current.OperandDist + ") = 0";
                    break;
                case Opcode.BSF:
                    current.Comment = current.OperandString + "(" + current.OperandDist + ") = 1";
                    break;
                case Opcode.BTFSS:
                    if (next.Opcode == Opcode.BRA || next.Opcode == Opcode.CALL || next.Opcode == Opcode.GOTO)
                    {
                        var str = next.Opcode == Opcode.CALL ? ") call " : ") goto ";
                        next.Comment = "if !" + current.OperandString + "(" + current.OperandDist + str + next.BranchLabel.Name;
                        current.Comment = null;
                    }
                    else
                        current.Comment = "if " + current.OperandString + "(" + current.OperandDist + ") then skip";
                    break;
                case Opcode.BTFSC:
                    if (next.Opcode == Opcode.BRA || next.Opcode == Opcode.CALL || next.Opcode == Opcode.GOTO)
                    {
                        var str = next.Opcode == Opcode.CALL ? ") call " : ") goto ";
                        next.Comment = "if " + current.OperandString + "(" + current.OperandDist + str + next.BranchLabel.Name;
                        current.Comment = null;
                    }
                    else
                        current.Comment = "if !" + current.OperandString + "(" + current.OperandDist + ") then skip";
                    break;
           
            }
            return pos;
        }
        public void DumbAnalyzeBSR() // used to see if we can reach the code, and if so, whats it bsr
        {
            int bsr = 0;
            for (int i = 0; i < instructions.Count; i++)
            {
                var inst = instructions[i];
                if (inst.Opcode == Opcode.MOVLB)
                {
                    bsr = inst.Operand;
                    inst.BSR = bsr;
                    continue;
                }
                inst.BSR = bsr;
                if (inst.Type == OperandType.File)
                {
                    string reg = IncludeFile.GetReg(inst.Operand, bsr);
                    if (reg != null) inst.OperandString = reg;
                }
                else if (inst.Type == OperandType.Bit)
                {
                    string reg = IncludeFile.GetReg(inst.Operand, bsr);
                    if (reg != null)
                    {
                        inst.OperandString = reg;
                        string bit = IncludeFile.GetBitName(inst.OperandString, inst.RegBit);
                        if (bit != null) inst.OperandDist = bit;
                    }
                }
                i = Analyze(i);
            }
        }
  
        public void DebugDecode(List<Info> debug)
        {
            debug.Sort();
            instructions = new List<Instruction>();
            int bsr = 0;
            foreach (var info in debug)
            {
                Instruction inst = new Instruction(info.Address, info.Data, labels);
                instructions.Add(inst);
                if (inst.Opcode == Opcode.MOVLB)
                {
                    bsr = inst.Operand;
                    inst.BSR = bsr;
                }else if (inst.Type == OperandType.File)
                {
                    string reg = IncludeFile.GetReg(inst.Operand, bsr);
                    if (reg != null) inst.OperandString = reg;
                }
                else if (inst.Type == OperandType.Bit)
                {
                    string reg = IncludeFile.GetReg(inst.Operand, bsr);
                    if (reg != null)
                    {
                        inst.OperandString = reg;
                        string bit = IncludeFile.GetBitName(inst.OperandString, inst.RegBit);
                        if (bit != null) inst.OperandDist = bit;
                    }
                }
               
            }
        }
        public void Dissasemble(string filename)
        {
            labels = new Dictionary<int, Label>();
            DebugDecode(FromFile(filename).ToList());
            // The magic of lambas
           // instructions = new List<Instruction>();
            
        //    instructions = debug.Select(info =>  new Instruction(info.Address, info.Data, labels)).ToList(); 
            Dictionary<Label, int> labelToPosition = instructions.Where(x => labels.TryGetValue(x.Address,out x.Label)).ToDictionary(x => x.Label, x => instructions.IndexOf(x));
            instructions.DebugSave("test.lst");
            using (StreamWriter sw = new StreamWriter(Path.ChangeExtension(filename, "lst")))
            {
                sw.WriteLine("; FileName {0}", filename);
                foreach (var i in instructions)
                    sw.WriteLine(i.ToString());
            }
            DumbAnalyzeBSR();
            instructions.DebugSave("test2.lst");
            instructions.Remove(instructions.Single(x => x.Address == 0x8008));
            instructions.Remove(instructions.Single(x => x.Address == 0x8007));// remove the config
       
            var graph = FlowAnalysis.ControlFlowGraphBuilder.Build(instructions);
            var export = graph.ExportGraph();
            export.Save("test.dot");
        }
    }
}