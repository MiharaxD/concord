// Windows x64 bridge for the official Discord Social SDK 1.10.19337 C API.
// All SDK work/callbacks run on this thread. Credentials arrive only through stdin.
using System;
using System.Text;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

static class DiscordSocial {
    const string Dll = "discord_partner_sdk.dll";
    [StructLayout(LayoutKind.Sequential)] struct Handle { public IntPtr Opaque; }
    [StructLayout(LayoutKind.Sequential)] struct NativeString { public IntPtr Ptr; public UIntPtr Size; }
    [StructLayout(LayoutKind.Sequential)] struct Span { public IntPtr Ptr; public UIntPtr Size; }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void TokenCallback(IntPtr result, IntPtr data);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void MessageCallback(IntPtr result, ulong messageId, IntPtr data);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_RunCallbacks();
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Free(IntPtr ptr);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_Init(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_Drop(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_SetApplicationId(ref Handle self, ulong id);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_UpdateToken(ref Handle self, int type, NativeString token, TokenCallback callback, IntPtr free, IntPtr data);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_Connect(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_Disconnect(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_Client_GetStatus(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_GetRelationships(ref Handle self, out Span output);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_GetRelationshipHandle(ref Handle self, ulong id, out Handle output);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_RelationshipHandle_Drop(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_RelationshipHandle_DiscordRelationshipType(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.I1)] static extern bool Discord_RelationshipHandle_User(ref Handle self, out Handle output);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_UserHandle_Drop(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern ulong Discord_UserHandle_Id(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_UserHandle_DisplayName(ref Handle self, out NativeString output);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_UserHandle_Username(ref Handle self, out NativeString output);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.I1)] static extern bool Discord_UserHandle_Avatar(ref Handle self, out NativeString output);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_UserHandle_Status(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_Client_SendUserMessage(ref Handle self, ulong recipient, NativeString content, MessageCallback callback, IntPtr free, IntPtr data);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.I1)] static extern bool Discord_ClientResult_Successful(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_ClientResult_Status(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_ClientResult_ErrorCode(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern void Discord_ClientResult_Drop(ref Handle self);
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_Client_GetVersionMajor();
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_Client_GetVersionMinor();
    [DllImport(Dll, CallingConvention=CallingConvention.Cdecl)] static extern int Discord_Client_GetVersionPatch();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1048576, RecursionLimit = 12 };
    static readonly ConcurrentQueue<string> Input = new ConcurrentQueue<string>();
    static readonly TokenCallback OnToken = TokenUpdated;
    static readonly MessageCallback OnMessage = MessageSent;
    static Handle Client;
    static bool Exit, Initialized;
    static int Connecting;
    static DateTime ConnectDeadline;
    static void Reply(int id, object value) { Console.WriteLine(Json.Serialize(new { id = id, ok = true, value = value })); Console.Out.Flush(); }
    static void Fail(int id, string code, int status = 0) { Console.WriteLine(Json.Serialize(new { id = id, ok = false, code = code, status = status })); Console.Out.Flush(); }
    static string Take(NativeString value) {
        try { int size = checked((int)value.Size.ToUInt64()); if (size > 32768) throw new Exception(); byte[] bytes = new byte[size]; if (size > 0) Marshal.Copy(value.Ptr, bytes, 0, size); return Encoding.UTF8.GetString(bytes); }
        finally { if (value.Ptr != IntPtr.Zero) Discord_Free(value.Ptr); }
    }
    sealed class BorrowedString : IDisposable {
        public NativeString Value;
        public BorrowedString(string text) { byte[] bytes = Encoding.UTF8.GetBytes(text); Value.Ptr = Marshal.AllocHGlobal(Math.Max(bytes.Length, 1)); Value.Size = new UIntPtr((uint)bytes.Length); Marshal.Copy(bytes, 0, Value.Ptr, bytes.Length); }
        public void Dispose() { Marshal.FreeHGlobal(Value.Ptr); }
    }
    static void TokenUpdated(IntPtr result, IntPtr data) {
        var value = (Handle)Marshal.PtrToStructure(result, typeof(Handle)); int id = data.ToInt32();
        try { if (!Discord_ClientResult_Successful(ref value)) { Fail(id, "AUTH", Discord_ClientResult_Status(ref value)); return; }
            Connecting = id; ConnectDeadline = DateTime.UtcNow.AddSeconds(25); Discord_Client_Connect(ref Client); }
        finally { Discord_ClientResult_Drop(ref value); }
    }
    static void MessageSent(IntPtr result, ulong messageId, IntPtr data) {
        var value = (Handle)Marshal.PtrToStructure(result, typeof(Handle)); int id = data.ToInt32();
        try { if (Discord_ClientResult_Successful(ref value) && messageId != 0) Reply(id, new { sent = true });
            else Fail(id, "SEND", Discord_ClientResult_Status(ref value)); }
        finally { Discord_ClientResult_Drop(ref value); }
    }
    static bool IsFriend(ref Handle relationship) { return relationship.Opaque != IntPtr.Zero && Discord_RelationshipHandle_DiscordRelationshipType(ref relationship) == 1; }
    static object Friends() {
        Span span; Discord_Client_GetRelationships(ref Client, out span); var list = new List<object>();
        int count = checked((int)span.Size.ToUInt64());
        try {
            for (int i = 0; i < count; i++) {
                Handle relationship = new Handle { Opaque = Marshal.ReadIntPtr(span.Ptr, i * IntPtr.Size) };
                try {
                    Handle user;
                    if (i >= 10000 || !IsFriend(ref relationship) || !Discord_RelationshipHandle_User(ref relationship, out user)) continue;
                    try { NativeString name, username, avatar;
                        Discord_UserHandle_DisplayName(ref user, out name); Discord_UserHandle_Username(ref user, out username);
                        string photo = Discord_UserHandle_Avatar(ref user, out avatar) ? Take(avatar) : "";
                        int status = Discord_UserHandle_Status(ref user);
                        list.Add(new { id = Discord_UserHandle_Id(ref user).ToString(), name = Take(name), username = Take(username), avatar = photo, online = status == 0 || status == 3 || status == 4 || status == 6 });
                    } finally { Discord_UserHandle_Drop(ref user); }
                } finally { Discord_RelationshipHandle_Drop(ref relationship); }
            }
        } finally { if (span.Ptr != IntPtr.Zero) Discord_Free(span.Ptr); }
        return list;
    }
    static string Text(Dictionary<string, object> value, string key) { object result; return value.TryGetValue(key, out result) ? result as string : null; }
    static void Command(string line) {
        int id = 0;
        try {
            if (line.Length > 32768) return;
            var command = Json.Deserialize<Dictionary<string, object>>(line); id = Convert.ToInt32(command["id"]); string type = Text(command, "type");
            if (type == "quit") { Exit = true; return; }
            if (type == "connect") {
                if (Connecting != 0) { Fail(id, "BUSY"); return; }
                if (Initialized) { Discord_Client_Disconnect(ref Client); Discord_Client_Drop(ref Client); }
                Discord_Client_Init(ref Client); Initialized = true; Discord_Client_SetApplicationId(ref Client, ulong.Parse(Text(command, "clientId")));
                string token = Text(command, "token"); if (token == null || token.Length > 8192) { Fail(id, "AUTH"); return; }
                using (var input = new BorrowedString(token)) Discord_Client_UpdateToken(ref Client, 1, input.Value, OnToken, IntPtr.Zero, new IntPtr(id));
                return;
            }
            if (!Initialized || Discord_Client_GetStatus(ref Client) != 3) { Fail(id, "OFFLINE"); return; }
            if (type == "friends") { Reply(id, Friends()); return; }
            if (type == "invite") {
                ulong recipient = ulong.Parse(Text(command, "userId")); Handle relationship; Discord_Client_GetRelationshipHandle(ref Client, recipient, out relationship);
                bool friend; try { friend = IsFriend(ref relationship); } finally { if (relationship.Opaque != IntPtr.Zero) Discord_RelationshipHandle_Drop(ref relationship); }
                if (!friend) { Fail(id, "NOT_FRIEND"); return; }
                string link = Text(command, "link"); Uri uri;
                if (link == null || link.Length > 4096 || !Uri.TryCreate(link, UriKind.Absolute, out uri) || (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback))) { Fail(id, "INVITE"); return; }
                using (var content = new BorrowedString(link)) Discord_Client_SendUserMessage(ref Client, recipient, content.Value, OnMessage, IntPtr.Zero, new IntPtr(id));
                return;
            }
            Fail(id, "COMMAND");
        } catch { Fail(id, "SDK"); }
    }
    static int Main(string[] args) {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        try {
            if (args.Length == 1 && args[0] == "--probe") {
                Discord_Client_Init(ref Client); Initialized = true;
                Reply(0, new { version = Discord_Client_GetVersionMajor() + "." + Discord_Client_GetVersionMinor() + "." + Discord_Client_GetVersionPatch() }); return 0;
            }
            var reader = new Thread(() => { string line; while ((line = Console.ReadLine()) != null) Input.Enqueue(line); Input.Enqueue("{\"id\":0,\"type\":\"quit\"}"); }); reader.IsBackground = true; reader.Start();
            while (!Exit) {
                string line; while (Input.TryDequeue(out line)) Command(line);
                Discord_RunCallbacks();
                if (Connecting != 0) {
                    if (Discord_Client_GetStatus(ref Client) == 3) { Reply(Connecting, new { connected = true }); Connecting = 0; }
                    else if (DateTime.UtcNow > ConnectDeadline) { Fail(Connecting, "CONNECT_TIMEOUT"); Connecting = 0; }
                }
                Thread.Sleep(10);
            }
            return 0;
        } catch { Fail(0, "COMPONENT"); return 1; }
        finally { if (Initialized) { Discord_Client_Disconnect(ref Client); Discord_Client_Drop(ref Client); } }
    }
}
