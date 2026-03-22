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
                    .ToHashSet(StringComparer.OrdinalIgnoreCase)
                : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        public bool IsValid(string key) =>
            !string.IsNullOrWhiteSpace(key) && _validKeys.Contains(key.Trim());
    }
}
