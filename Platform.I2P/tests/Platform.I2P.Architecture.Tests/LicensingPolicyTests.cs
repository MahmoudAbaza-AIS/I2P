using System.Text.RegularExpressions;
using System.Xml.Linq;
using FluentAssertions;

namespace Platform.I2P.Architecture.Tests;

/// <summary>
/// D7 Option B — fail the build if commercial-prone majors re-enter the graph via PackageReference.
/// </summary>
public sealed class LicensingPolicyTests
{
    private static readonly Regex VersionAttr = new(
        @"Version\s*=\s*""(?<v>[^""]+)""",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    [Fact]
    public void PackageReferences_Respect_D7_Option_B_Version_Ceilings()
    {
        var repoRoot = FindRepoRoot();
        var csprojs = Directory.EnumerateFiles(
                Path.Combine(repoRoot, "Platform.I2P"),
                "*.csproj",
                SearchOption.AllDirectories)
            .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase))
            .ToList();

        csprojs.Should().NotBeEmpty();

        var violations = new List<string>();

        foreach (var path in csprojs)
        {
            var doc = XDocument.Load(path);
            foreach (var reference in doc.Descendants("PackageReference"))
            {
                var id = (string?)reference.Attribute("Include") ?? (string?)reference.Attribute("Update");
                var version = (string?)reference.Attribute("Version");
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(version))
                {
                    continue;
                }

                if (!Version.TryParse(NormalizeVersion(version), out var parsed))
                {
                    continue;
                }

                if (id.Equals("FluentAssertions", StringComparison.OrdinalIgnoreCase) && parsed.Major >= 8)
                {
                    violations.Add($"{Rel(repoRoot, path)}: FluentAssertions {version} (>= 8 commercial for commercial use)");
                }

                if (id.StartsWith("MassTransit", StringComparison.OrdinalIgnoreCase) && parsed.Major >= 9)
                {
                    violations.Add($"{Rel(repoRoot, path)}: {id} {version} (>= 9 commercial)");
                }

                if (id.Equals("MediatR", StringComparison.OrdinalIgnoreCase) &&
                    parsed > new Version(12, 5, 0))
                {
                    violations.Add($"{Rel(repoRoot, path)}: MediatR {version} (> 12.5.0 RPL/commercial)");
                }

                if (id.Equals("AutoMapper", StringComparison.OrdinalIgnoreCase) && parsed.Major >= 15)
                {
                    violations.Add($"{Rel(repoRoot, path)}: AutoMapper {version} (>= 15 RPL/commercial)");
                }

                if (id.StartsWith("Duende.", StringComparison.OrdinalIgnoreCase))
                {
                    violations.Add($"{Rel(repoRoot, path)}: {id} {version} (Duende deferred to D8; do not add)");
                }
            }
        }

        violations.Should().BeEmpty("D7 Option B forbids these PackageReference versions:\n" + string.Join("\n", violations));
    }

    private static string NormalizeVersion(string version)
    {
        // Strip range syntax leftovers if any single version was used.
        var m = VersionAttr.Match($"Version=\"{version}\"");
        return m.Success ? m.Groups["v"].Value.Split('-')[0] : version.Split('-')[0];
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, ".gitignore")) &&
                Directory.Exists(Path.Combine(dir.FullName, "Platform.I2P")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new InvalidOperationException("Could not locate repository root from test base directory.");
    }

    private static string Rel(string root, string path) =>
        Path.GetRelativePath(root, path).Replace('\\', '/');
}
