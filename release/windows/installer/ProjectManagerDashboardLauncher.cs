using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace ProjectManagerDashboardLauncher
{
    internal static class Program
    {
        private static readonly string[] AllowedCommands = { "--start", "--stop", "--check" };

        [STAThread]
        private static int Main(string[] args)
        {
            string command = args.Length == 0 ? "--start" : args.Length == 1 ? args[0] : string.Empty;
            if (Array.IndexOf(AllowedCommands, command) < 0)
            {
                return Fail("Unsupported command. Use --start, --stop, or --check.", string.Empty);
            }

            string installationRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar);
            string nodePath = Path.Combine(installationRoot, "runtime", "node.exe");
            string launcherPath = Path.Combine(installationRoot, "launcher", "launcher.mjs");
            if (!File.Exists(nodePath) || !File.Exists(launcherPath))
            {
                return Fail("The installation is incomplete. Reinstall Project Manager Dashboard.", string.Empty);
            }

            StringBuilder output = new StringBuilder();
            object outputLock = new object();
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = nodePath;
            startInfo.Arguments = Quote(launcherPath) + " " + command;
            startInfo.WorkingDirectory = installationRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;

            try
            {
                using (Process process = new Process())
                {
                    process.StartInfo = startInfo;
                    process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
                    {
                        AppendLine(output, outputLock, eventArgs.Data);
                    };
                    process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
                    {
                        AppendLine(output, outputLock, eventArgs.Data);
                    };
                    process.Start();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();
                    process.WaitForExit();
                    process.WaitForExit();

                    string capturedOutput;
                    lock (outputLock)
                    {
                        capturedOutput = output.ToString();
                    }
                    WriteLog(command, process.ExitCode, capturedOutput);
                    if (process.ExitCode != 0)
                    {
                        return Fail("Project Manager Dashboard could not complete " + command + ".", capturedOutput);
                    }
                }
            }
            catch (Exception exception)
            {
                return Fail("Project Manager Dashboard could not start.", exception.ToString());
            }

            return 0;
        }

        private static void AppendLine(StringBuilder output, object outputLock, string value)
        {
            if (value == null) return;
            lock (outputLock)
            {
                output.AppendLine(value);
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static int Fail(string message, string details)
        {
            WriteLog("error", 1, message + Environment.NewLine + details);
            if (!SuppressDialogs())
            {
                string displayDetails = details ?? string.Empty;
                if (displayDetails.Length > 1800) displayDetails = displayDetails.Substring(0, 1800);
                string display = string.IsNullOrWhiteSpace(displayDetails)
                    ? message
                    : message + Environment.NewLine + Environment.NewLine + displayDetails;
                MessageBox.Show(
                    display,
                    "Project Manager Dashboard",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            return 1;
        }

        private static bool SuppressDialogs()
        {
            return string.Equals(Environment.GetEnvironmentVariable("CI"), "true", StringComparison.OrdinalIgnoreCase)
                || string.Equals(Environment.GetEnvironmentVariable("PM_LAUNCHER_NO_DIALOGS"), "1", StringComparison.Ordinal);
        }

        private static void WriteLog(string command, int exitCode, string output)
        {
            try
            {
                string dataRoot = Environment.GetEnvironmentVariable("PM_DATA_DIR");
                if (string.IsNullOrWhiteSpace(dataRoot))
                {
                    dataRoot = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "ProjectManagerDashboard");
                }
                string logDirectory = Path.Combine(dataRoot, "logs");
                Directory.CreateDirectory(logDirectory);
                string entry = string.Format(
                    "[{0:O}] command={1} exitCode={2}{3}{4}{3}",
                    DateTime.UtcNow,
                    command,
                    exitCode,
                    Environment.NewLine,
                    output ?? string.Empty);
                File.AppendAllText(Path.Combine(logDirectory, "launcher-exe.log"), entry, Encoding.UTF8);
            }
            catch
            {
                // Logging must never hide the original launch result.
            }
        }
    }
}
