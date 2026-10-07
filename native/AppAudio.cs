using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text;

// Live Windows WASAPI process-loopback capture. PCM stays in pipes, never in a file.
namespace ConcordAudio {
  [StructLayout(LayoutKind.Explicit, Size = 24)]
  struct PropVariant {
    [FieldOffset(0)] public ushort Type;
    [FieldOffset(8)] public uint BlobSize;
    [FieldOffset(16)] public IntPtr BlobData;
  }
  [StructLayout(LayoutKind.Sequential, Pack = 2)]
  struct WaveFormat {
    public ushort Format, Channels;
    public uint SampleRate, BytesPerSecond;
    public ushort BlockAlign, Bits, Extra;
  }
  [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IActivationOperation {
    [PreserveSig] int GetActivateResult(out int result, [MarshalAs(UnmanagedType.IUnknown)] out object audio);
  }
  [ComVisible(true), Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface ICompletion { [PreserveSig] int ActivateCompleted(IActivationOperation operation); }
  [ComVisible(true), Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAgileObject {}
  [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
  public class Completion : ICompletion, IAgileObject {
    public readonly ManualResetEvent Completed = new ManualResetEvent(false);
    public object Audio; public int Result;
    public int ActivateCompleted(IActivationOperation operation) {
      try { int hr = operation.GetActivateResult(out Result, out Audio); if (hr < 0) Result = hr; }
      catch (Exception error) { Result = Marshal.GetHRForException(error); }
      finally { Completed.Set(); }
      return 0;
    }
  }
  [ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioClient {
    [PreserveSig] int Initialize(int mode, uint flags, long duration, long periodicity, ref WaveFormat format, IntPtr session);
    [PreserveSig] int GetBufferSize(out uint frames);
    [PreserveSig] int GetStreamLatency(out long latency);
    [PreserveSig] int GetCurrentPadding(out uint padding);
    [PreserveSig] int IsFormatSupported(int mode, IntPtr format, out IntPtr closest);
    [PreserveSig] int GetMixFormat(out IntPtr format);
    [PreserveSig] int GetDevicePeriod(out long normal, out long minimum);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr handle);
    [PreserveSig] int GetService(ref Guid id, [MarshalAs(UnmanagedType.IUnknown)] out object service);
  }
  [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong position, out ulong time);
    [PreserveSig] int ReleaseBuffer(uint frames);
    [PreserveSig] int GetNextPacketSize(out uint frames);
  }
  class Program {
    [DllImport("Mmdevapi.dll", CharSet = CharSet.Unicode)]
    static extern int ActivateAudioInterfaceAsync(string path, ref Guid id, ref PropVariant activation, ICompletion handler, out IActivationOperation operation);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("ntdll.dll", CharSet = CharSet.Unicode)] static extern int RtlGetVersion(ref OsVersion version);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct OsVersion {
      public uint Size, Major, Minor, Build, Platform;
      [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string ServicePack;
    }
    static volatile bool stopping;
    static void Check(int hr) { if (hr < 0) Marshal.ThrowExceptionForHR(hr); }
    [MTAThread]
    static int Main(string[] args) {
      IAudioClient client = null;
      IAudioCaptureClient capture = null;
      IntPtr parameters = IntPtr.Zero;
      IActivationOperation operation = null;
      Completion completion = new Completion();
      string stage = "preparacao";
      try {
        Console.SetError(new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true });
        if (args.Length != 2 || (args[0] != "--window" && args[0] != "--pid")) throw new ArgumentException("Fonte de audio invalida.");
        OsVersion version = new OsVersion(); version.Size = (uint)Marshal.SizeOf(typeof(OsVersion));
        Check(RtlGetVersion(ref version));
        if (version.Build < 20348) throw new NotSupportedException("Audio por aplicativo exige Windows build 20348 ou mais recente (Windows 11).");
        uint pid;
        if (args[0] == "--window") {
          IntPtr window = new IntPtr(long.Parse(args[1]));
          if (!IsWindow(window)) throw new ArgumentException("A janela escolhida foi fechada.");
          GetWindowThreadProcessId(window, out pid);
        } else pid = uint.Parse(args[1]); // Only used by the native isolation test.
        if (pid == 0) throw new ArgumentException("Processo da janela indisponivel.");
        parameters = Marshal.AllocHGlobal(12);
        Marshal.WriteInt32(parameters, 0, 1); // PROCESS_LOOPBACK
        Marshal.WriteInt32(parameters, 4, unchecked((int)pid));
        Marshal.WriteInt32(parameters, 8, 0); // INCLUDE_TARGET_PROCESS_TREE
        PropVariant activation = new PropVariant { Type = 65, BlobSize = 12, BlobData = parameters };
        Guid audioClientId = typeof(IAudioClient).GUID;
        stage = "ativacao";
        Check(ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref audioClientId, ref activation, completion, out operation));
        if (!completion.Completed.WaitOne(10000)) throw new TimeoutException("O Windows nao respondeu a captura de audio do aplicativo.");
        stage = "resultado da ativacao"; Check(completion.Result);
        client = (IAudioClient)completion.Audio;
        WaveFormat format = new WaveFormat { Format = 1, Channels = 2, SampleRate = 48000, BytesPerSecond = 192000, BlockAlign = 4, Bits = 16, Extra = 0 };
        stage = "formato de audio";
        Check(client.Initialize(0, 0x80060000, 0, 0, ref format, IntPtr.Zero)); // loopback + event + auto-conversion
        Guid captureId = typeof(IAudioCaptureClient).GUID; object service;
        stage = "servico de captura"; Check(client.GetService(ref captureId, out service)); capture = (IAudioCaptureClient)service;
        using (AutoResetEvent samplesReady = new AutoResetEvent(false)) {
          stage = "evento de audio"; Check(client.SetEventHandle(samplesReady.SafeWaitHandle.DangerousGetHandle()));
          stage = "inicio da captura";
          Check(client.Start());
          Thread stopReader = new Thread(delegate() { try { Console.OpenStandardInput().ReadByte(); } catch {} stopping = true; });
          stopReader.IsBackground = true; stopReader.Start();
          Console.Error.WriteLine("READY 48000 2 s16le");
          Stream output = Console.OpenStandardOutput();
          while (!stopping) {
            samplesReady.WaitOne(100);
            uint packet;
            Check(capture.GetNextPacketSize(out packet));
            while (packet > 0 && !stopping) {
              IntPtr data; uint frames, flags; ulong position, time;
              Check(capture.GetBuffer(out data, out frames, out flags, out position, out time));
              try {
                byte[] bytes = new byte[checked((int)frames * 4)];
                if ((flags & 2) == 0 && data != IntPtr.Zero) Marshal.Copy(data, bytes, 0, bytes.Length);
                output.Write(bytes, 0, bytes.Length);
              } finally { Check(capture.ReleaseBuffer(frames)); }
              Check(capture.GetNextPacketSize(out packet));
            }
          }
        }
        return 0;
      } catch (Exception error) {
        Console.Error.WriteLine("ERROR " + stage + ": " + error.Message + " (0x" + Marshal.GetHRForException(error).ToString("X8") + ")");
        return 1;
      } finally {
        if (client != null) client.Stop();
        if (capture != null && Marshal.IsComObject(capture)) Marshal.ReleaseComObject(capture);
        if (client != null && Marshal.IsComObject(client)) Marshal.ReleaseComObject(client);
        if (operation != null && Marshal.IsComObject(operation)) Marshal.ReleaseComObject(operation);
        if (parameters != IntPtr.Zero) Marshal.FreeHGlobal(parameters);
        GC.KeepAlive(completion);
      }
    }
  }
}
