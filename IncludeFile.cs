using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace pic16f19x
{
    public static class IncludeFile
    {


        static Regex startRegs_regex = new Regex(@"^;----- Register Files.*", RegexOptions.Compiled);
        static Regex end_regex = new Regex(@"^;=+.*", RegexOptions.Compiled);
        static Regex bank_regex = new Regex(@"^;-----Bank(\d+).*", RegexOptions.Compiled);
        static Regex bits_regex = new Regex(@"^\s*;-----\s*([\w\d]+)\s*Bits.*", RegexOptions.Compiled);
        static Regex equ_regex = new Regex(@"^\s*([\w\d]+)\s*EQU\s*H'([0-9A-Fa-f]+)'.*", RegexOptions.Compiled);

        static Dictionary<int, Dictionary<int, string>> bankRegs = new Dictionary<int, Dictionary<int, string>>();
        static  Dictionary<string, Dictionary<int, string>> bitLookup = new Dictionary<string, Dictionary<int, string>>();
        static Dictionary<string, int> allEqu = new Dictionary<string, int>();
        public static IReadOnlyDictionary<string,int> EQU {  get { return allEqu; } }

        public static string GetReg(int reg) // general regesters
        {
            if (reg > 0xF) return "0x" + reg.ToString("X2");
            else return null; // not found, need a bank from here
        }
        public static string GetReg(int reg, int bankn)
        {
            if (reg <= 0xB) bankn = 0; // if its one of the general ones
            Dictionary<int, string> rbank;
            if (bankRegs.TryGetValue(bankn, out rbank))
            {
                string name;
                if (rbank.TryGetValue(reg & 0x1F, out name)) return name;
            }
            return null; // not found
        }
        public static IEnumerable<string> GetSetFlags(string regName, int value)
        {
            Dictionary<int, string> bits;
            if (bitLookup.TryGetValue(regName, out bits))
            {
                for(int i=0;i < 8; i++)
                {
                    bool isSet = ((value >> i) & 1) != 0;
                    string name;
                    if (isSet && bits.TryGetValue(i, out name)) yield return name;
                }
                
            }
        }
        public static string GetBitName(string regName, int bit)
        {
            Dictionary<int, string> bits;
            if (bitLookup.TryGetValue(regName, out bits))
            {
                string name;
                if (bits.TryGetValue(bit, out name)) return name;
            }
            return null;
        }
        // When equal dosn't cut it and the asm symbol is stupid, like putting 1 or L somewhere
        // in the MIDDLE of the symbol...sigh
        static string MatchClose(string a, string b)
        {
            if (a.Length < b.Length) { var s = b; b = a; a = s; } // a MUSt be bigger
            int count = 0;
            foreach (var c in a)
                if (b[count] == c)
                {
                    count++;
                    if (count == b.Length) return a; // return a because it contains b with the right order of charaters
                }
            return null;
        }
        static void CheckEQU(string name, int value)
        {
            int check;
            if (allEqu.TryGetValue(name, out check))
            {
                if (check != value) throw new Exception("EQU Name changed");
            }
            else allEqu.Add(name, value);
        }
        static bool MatchEQU(string line, Dictionary<int, string> table)
        {
            if (line[0] == ';') return false;
            Match m = equ_regex.Match(line);
            if (m.Success)
            {
                string matchName = string.Intern(m.Groups[1].Value); // save some memory
                string name;
                int value = Convert.ToInt32(m.Groups[2].Value, 16);
                CheckEQU(matchName, value);
                Debug.WriteLine("     " + matchName + "=" + value);
                if (table.TryGetValue(value, out name))
                {
                    // What happens is there is sometimes somthing like TMR0 and TMR0L  Both have the same value, just its a word 
                    // so you might need the high or low address.  We filter that out for reverse lookups 
                    // its not always so clear however, (for example CCP3AS  and ECCP3AS are the save value)
                    // so the stopgap is to just store the name that is longer
                    // Ugh, another bastard child is T1GGO_NOT_DONE and T1GGO, in that order
                    // ANOTHER FUCKING BASTARD GO_NOT_DONE vs ADGO
                    if (name == matchName) throw new Exception("name already is in there");
                    int lenDif = Math.Abs(name.Length - matchName.Length);
                    string check = MatchClose(name, matchName);

                    if (check == null)// ANOTHER FUCKING BASTARD GO_NOT_DONE vs ADGO
                    {
                        if (lenDif > 2 && name.Length > matchName.Length)
                        {
                            Debug.WriteLine("SWAP: " + name + " FOR " + matchName);
                            table.Remove(value); // The name is close enough for it to be right
                            table.Add(value, matchName);
                        }
                        else
                        {
                            Debug.WriteLine("NOSWAP: " + name + " FOR " + matchName);
                        }
                        //   throw new Exception("name already equal to something");
                    }
                    if (check != name)
                    {
                        if (lenDif < 4) // Unless its insanily long like T1GGO_NOT_DONE, swap it
                        {
                            Debug.WriteLine("SWAP: " + name + " FOR " + matchName);
                            table.Remove(value); // The name is close enough for it to be right
                            table.Add(value, matchName);
                        }
                    }
                }
                else
                    table.Add(value, matchName);

            }
            return true;
        }
        static List<string> GetAllLines(Stream file)
        {
            StreamReader r = new StreamReader(file);
            string line;
            List<string> lines = new List<string>();
            while ((line = r.ReadLine()) != null)
            {
                line = line.Trim();
                if (!string.IsNullOrWhiteSpace(line) && line.Length > 2) lines.Add(line);
            }
            return lines;
        }
        public static void ReadIncludeFile(string filename)
        {
            using (FileStream file = new FileStream(filename, FileMode.Open))
                ReadIncludeFile(file);
        }
        public static void ReadIncludeFile(Stream file)
        {
            bankRegs = new Dictionary<int, Dictionary<int, string>>();
            bitLookup = new Dictionary<string, Dictionary<int, string>>();
            allEqu = new Dictionary<string, int>();
            bool atstart = false;
            List<string> lines = GetAllLines(file);
            int pos = 0;
            Action<Func<string, bool>> ReadTill = (func) =>
             {
                 for (pos++; pos < lines.Count; pos++)
                 {
                     string line = lines[pos];
                     if (!func(line)) { pos--; break; }
                 }
             };

            ReadTill(line =>
            {
                Match m = null;
                if (line[0] == ';')
                {
                    if (!atstart)
                    {
                        if (line.Contains("Register Files"))
                            atstart = true;
                        return true;
                    }
                    else
                    {
                        if (line[1] == '=') return false; // end
                        if (line[1] == '-')
                        {
                            m = bank_regex.Match(line);
                            if (m.Success)
                            {
                                int i = Convert.ToInt32(m.Groups[1].Value);
                                Dictionary<int, string> bank = new Dictionary<int, string>();
                                Debug.WriteLine("Bank: " + i);
                                ReadTill(iline => MatchEQU(iline, bank));
                                bank = bank.ToDictionary(k => k.Key & 0x7F, v => v.Value); // fix it
                                bankRegs.Add(i, bank);
                                return true;
                            }
                            m = bits_regex.Match(line);
                            if (m.Success)
                            {
                                Dictionary<int, string> bits = null;
                                string regName = m.Groups[1].Value;
                                Debug.WriteLine("Bits: " + regName);
                                if (!bitLookup.TryGetValue(regName, out bits)) bitLookup.Add(regName, bits = new Dictionary<int, string>());
                                ReadTill(iline => MatchEQU(iline, bits));
                                return true;
                            }
                        }
                    }
                }
                return true;
            });
        }
    }
}
