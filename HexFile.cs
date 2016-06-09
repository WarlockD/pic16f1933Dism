using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Collections.ObjectModel;

using System.Threading.Tasks;
using System.IO;
using System.Text.RegularExpressions;

namespace pic16f19x
{
    public enum RecordType : byte
    {
        Data = 0,
        EndOfFile,
        ExtendedSegmentAddress,
        StartSegmentAddress,
        ExtendedLinearAddress,
        StartLinearAddress
    }
    public static class ByteExtensions
    {
        // Can't stand it, while there isn't that big of a preformance upgrade, the whole discusson got me thinking
        // http://stackoverflow.com/questions/311165/how-do-you-convert-byte-array-to-hexadecimal-string-and-vice-versa
        private static readonly uint[] _lookup32;
        private static readonly byte[] _bLookup32;
        // private static readonly 
        static ByteExtensions()
        {
            _lookup32 = new uint[256];
            _bLookup32 = new byte[256];
            for (int i = 0; i < 256; i++)
            {
                string s = i.ToString("X2");
                _lookup32[i] = ((uint) s[0]) + ((uint) s[1] << 16);
                _bLookup32[i] = 0xFF;
            }
            for (int i = 0; i < 10; i++) _bLookup32[i + '0'] = (byte) i;
            for (int i = 0; i < 6; i++) _bLookup32[i + 'A'] = _bLookup32[i + 'a'] = (byte) (i+10);

        }
        public static string toHex(this byte b)
        {
            uint lookup = _lookup32[b];
            return new string(new char[] { (char) lookup, (char) (lookup >> 16) });
        }
        public static string toHexString(this byte[] bytes)
        {
            var lookup32 = _lookup32;
            var result = new char[bytes.Length * 2];
            for (int i = 0; i < bytes.Length; i++)
            {
                var val = lookup32[bytes[i]];
                result[2 * i] = (char) val;
                result[2 * i + 1] = (char) (val >> 16);
            }
            return new string(result);
        }
        public static byte CheckSum(this IEnumerable<byte> bytes)
        {
            int chk = 0;
            foreach (var b in bytes) chk += b;
            return (byte) chk;
        }
        public static byte CheckSum(this byte[] bytes, int start = 0)
        {
            return bytes.CheckSum(start, bytes.Length);
        }
        public static byte CheckSum(this byte[] bytes, int start, int count)
        {
            int sum = 0;
            for (int i = start; i < count; i++) sum += bytes[i];
            return (byte) sum;
        }
        public static byte LookupByte(char c)
        {
            var b = _bLookup32[c];
            if (b == 255)
                throw new IOException("Expected a hex character, got " + c);
            return b;
        }
        public static T[] Slice<T>(this T[] arr, int start, int count)
        {
            if (count > arr.Length) throw new IndexOutOfRangeException("Slice count bigger than arr");
            if (start >= arr.Length) throw new IndexOutOfRangeException("Slice start more than size of array");
            T[] slice = new T[count];
            for (int i = start, j = 0; i < count; i++, j++) slice[j] = arr[i];
            return slice;
        }
        public static T[] Slice<T>(this T[] arr, int start)
        {
            if (start >= arr.Length) throw new IndexOutOfRangeException("Slice start more than size of array");
            T[] slice = new T[arr.Length - start];
            for (int i = 0; i < slice.Length; i++) slice[i] = arr[i];
            return slice;
        }
        public static byte ToByte(char c1, char c2)
        {
            return (byte) (LookupByte(c1) << 4 | LookupByte(c2));
        }
        public static byte ToByte(char[] chars, int offset)
        {
            return (byte) (LookupByte(chars[offset]) << 4 | LookupByte(chars[offset + 1]));
        }
        public static byte ToByte(this string chars, int offset)
        {
            return (byte) (LookupByte(chars[offset]) << 4 | LookupByte(chars[offset + 1]));
        }
        public static byte[] ToByteArray(this string str, int start = 0)
        {
            return str.ToByteArray(start, (str.Length-start) / 2);
        }
        public static byte[] ToByteArray(this string str, int start, int byteCount)
        {
            int len = str.Length;
            byte[] data = new byte[byteCount];
            for (int i=start,j = 0; j < byteCount;i+=2, j++)
                data[j] = (byte) ((LookupByte(str[i]) << 4) | LookupByte(str[i+1]));
            return data;
        }
        public static List<byte> ToByteList(this string str, int start = 0)
        {
            return str.ToByteList(start, (str.Length - start) / 2);
        }
        public static List<byte> ToByteList(this string str, int start, int byteCount)
        {
            int len = str.Length;
            List<byte> data = new List<byte>();
            for (int i = start, j = 0; j < byteCount; i += 2, j++) 
                data.Add((byte) ((LookupByte(str[i]) << 4) | LookupByte(str[i + 1])));
            return data;
        }
        public static string toHexString(this IReadOnlyList<byte> bytes, int start = 0)
        {
            var lookup32 = _lookup32;
            var result = new char[bytes.Count * 2];
            for (int i = start; i < bytes.Count; i++)
            {
                var val = lookup32[bytes[i]];
                result[2 * i] = (char) val;
                result[2 * i + 1] = (char) (val >> 16);
            }
            return new string(result);
        }
        public static string toHexString(this IReadOnlyList<byte> bytes, int start, int count)
        {
            var lookup32 = _lookup32;
            var result = new char[count * 2];
            for (int i = start; i < count; i++)
            {
                var val = lookup32[bytes[i]];
                result[2 * i] = (char) val;
                result[2 * i + 1] = (char) (val >> 16);
            }
            return new string(result);
        }
    }
    class HexRecord : IEnumerable<byte>, IEquatable<HexRecord>
    {
        public List<byte> Data { get; set; }
        public RecordType Type { get; set; }
        public int Address { get; set; }

        public byte[] toByteArray()
        {
            byte[] data = new byte[5 + this.Data.Count];
            int i = 0;
            data[i++] = (byte) this.Data.Count;
            data[i++] = (byte) (Address >> 8);
            data[i++] = (byte) (Address);
            data[i++] = (byte) Type;
            foreach (var b in Data) data[i++] = b;
            byte chk = data.CheckSum(0, data.Length - 1);
            data[i] = (byte) ((~chk & 0xFF) + 1);
            return data;
        }
        public HexRecord(string line)
        {
            if (string.IsNullOrWhiteSpace(line)) throw new ArgumentNullException("line");
            if (line.Length < 11 || line[0] != ':') throw new ArgumentException("Missing collon", "line");
            byte[] data = line.ToByteArray(1);
            if (data.CheckSum() != 0) throw new Exception("Bad Checksum");
            Address = data[1] << 8 | data[2];
            Type = (RecordType) data[3];
            Data = data.Skip(4).ToList();
            Data.RemoveAt(Data.Count - 1);
            if (data[0] != this.Data.Count) throw new Exception("Count wrong");
        }

        public bool Equals(HexRecord other)
        {
            if (other.Type != this.Type) return false;
            if (this.Data.Count != other.Data.Count) return false;
            return Type == RecordType.Data ? Array.Equals(this.Data.ToArray(), other.Data.ToArray()) : true;
        }
        public override string ToString()
        {
            byte[] data = toByteArray();
            return ':' + data.toHexString();
        }

        public IEnumerator<byte> GetEnumerator()
        {
            return Data.GetEnumerator();
        }
        public byte this[int i] { get { return Data[i]; } set { Data[i] = value; } }
        public int Count {  get { return Data.Count; } }
        IEnumerator IEnumerable.GetEnumerator()
        {
            return GetEnumerator();
        }
    }
    class HexFile
    {
        struct ByteInfo
        {
            public int Address;
            public byte Data;
        }
        Dictionary<int, byte> byteData = new Dictionary<int, byte>();
        Dictionary<int, int> wordData = new Dictionary<int, int>();
        public IReadOnlyDictionary<int,byte> Bytes {  get { return byteData; } }
        public IReadOnlyDictionary<int, int> Words { get { return wordData; } }
        public int AddressStart { get; private set; }
        public int AddressEnd { get; private set; }
        List<HexRecord> records;
        static Regex line_split = new Regex("\r\n|\r|\n", RegexOptions.Compiled);
        void ReadRawData(Stream data)
        {
            AddressStart = -1;
            AddressEnd = -1;
        StreamReader sr = new StreamReader(data);
            byteData = new Dictionary<int, byte>();
            int addru = 0;
            int addrl = 0;
            string line;
            int lineno = 0;
            records = new List<HexRecord>();
            while ((line = sr.ReadLine()) != null)
            {
                lineno++;
                if (string.IsNullOrWhiteSpace(line)) continue;
                line = line.Trim();
                if (line.Length < 11 || line[0] != ':') throw new Exception("Bad line at " + lineno);
                var record = new HexRecord(line);
                records.Add(record); // used for debuggin
                string dline = record.ToString();
                switch (record.Type)
                {
                    case RecordType.Data:
                        {
                            int addr = record.Address + (addrl | (addru << 16)); // add segment if I ever get around to setting it up
                            if (addr < AddressStart) AddressStart = addr;
                            foreach (var b in record) byteData.Add(addr++, b);
                            if (addr > AddressEnd) AddressEnd = addr;
                        }
                        break;
                    case RecordType.EndOfFile:
                        if (record.Count != 0) throw new Exception("Extra Data at end of file at line " + lineno);
                        return;
                    case RecordType.StartSegmentAddress:
                    case RecordType.ExtendedSegmentAddress:
                        throw new Exception("Segments not suppored as I am lazy at line " + lineno);
                    case RecordType.StartLinearAddress:
                        throw new Exception("Not many cpus support EIP do they?  Why do we use this format again? at line " + lineno);
                    case RecordType.ExtendedLinearAddress:
                        if (record.Count != 2) new Exception("Extended Linear Address must have a byte count of 2 at line " + lineno);
                        addru = (record[0] << 8) | record[1];
                        break;
                    default:
                        throw new Exception("Bad Rec type at line at line " + lineno);
                }

            }
            throw new Exception("No end of file marker found");
        }

        public HexFile(Stream data, bool wordSwap = false)
        {
            ReadRawData(data);
            wordData = new Dictionary<int, int>();
            KeyValuePair<int, byte> last = new KeyValuePair<int, byte>();
            foreach (var i in byteData)
            {
                if ((i.Key & 1) != 0)
                {
                    if (i.Key >> 1 != i.Key >> 1) throw new Exception("byte aligment issue");
                    wordData[i.Key >> 1] = wordSwap ? (last.Value | (i.Value << 8)) : (i.Value | (last.Value << 8));
                }
                else last = i;
            }
        }
    }
}