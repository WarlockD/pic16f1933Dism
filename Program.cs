using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.IO;
namespace pic16f19x
{
    class Program
    {
        static void Main(string[] args)
        {
          //  FileStream fs = new FileStream("HSFlash121.HEX", FileMode.Open);
          //  HexFile hf = new HexFile(fs,true);

            IncludeFile.ReadIncludeFile("p16f1933.inc");
            Dsam dsam = new Dsam();
            dsam.Dissasemble("HSFlash121.HEX");

        }
    }
}
