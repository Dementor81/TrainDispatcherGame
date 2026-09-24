using System.Text;

namespace TrainDispatcherGame.Server.Services
{
    public class LicenceKeyValidator
    {
        private readonly HashSet<string> _validKeys;

        public LicenceKeyValidator(IWebHostEnvironment env)
        {
            var path = Path.Combine(env.ContentRootPath, "data", "licence-keys.txt");
            _validKeys = File.Exists(path)
                ? File.ReadAllLines(path)
                    .Select(l => l.Split('#')[0].Trim())
                    .Where(l => l.Length > 0)
                    .ToHashSet(StringComparer.Ordinal)
                : new HashSet<string>(StringComparer.Ordinal);
        }

        public bool IsValid(string key) =>
            !string.IsNullOrWhiteSpace(key)
            && _validKeys.Contains(Convert.ToBase64String(Encoding.UTF8.GetBytes(key.Trim())));
    }
}
