using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Services
{
    public class LicenceKeyValidator
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        private readonly string _path;
        private readonly HashSet<string> _validKeys = new(StringComparer.Ordinal);
        private readonly List<LicenceKeyEntry> _keys = new();
        private readonly object _gate = new();

        public LicenceKeyValidator(IWebHostEnvironment env)
        {
            _path = Path.Combine(env.ContentRootPath, "data", "licence-keys.json");
            if (!File.Exists(_path))
            {
                return;
            }

            var entries = JsonSerializer.Deserialize<List<LicenceKeyEntry>>(File.ReadAllText(_path), JsonOptions) ?? new();
            foreach (var entry in entries)
            {
                var encoded = entry.Key?.Trim() ?? string.Empty;
                if (encoded.Length == 0 || !_validKeys.Add(encoded))
                {
                    continue;
                }

                _keys.Add(new LicenceKeyEntry
                {
                    Key = encoded,
                    Label = entry.Label?.Trim() ?? string.Empty
                });
            }
        }

        public static string Encode(string value) =>
            Convert.ToBase64String(Encoding.UTF8.GetBytes(value.Trim()));

        public IReadOnlyList<LicenceKeyEntry> Keys
        {
            get
            {
                lock (_gate)
                {
                    return _keys
                        .Select(entry => new LicenceKeyEntry { Key = entry.Key, Label = entry.Label })
                        .ToList();
                }
            }
        }

        public bool IsValid(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                return false;
            }

            var encoded = Encode(key);
            lock (_gate)
            {
                return _validKeys.Contains(encoded);
            }
        }

        public bool TryAdd(string key, string label)
        {
            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(label))
            {
                return false;
            }

            var encoded = Encode(key);
            var entry = new LicenceKeyEntry { Key = encoded, Label = label.Trim() };
            lock (_gate)
            {
                if (!_validKeys.Add(encoded))
                {
                    return false;
                }

                _keys.Add(entry);
                try
                {
                    Save();
                }
                catch
                {
                    _keys.Remove(entry);
                    _validKeys.Remove(encoded);
                    throw;
                }

                return true;
            }
        }

        public bool TryRemove(string encodedKey)
        {
            if (string.IsNullOrWhiteSpace(encodedKey))
            {
                return false;
            }

            var encoded = encodedKey.Trim();
            lock (_gate)
            {
                var index = _keys.FindIndex(entry => entry.Key == encoded);
                if (index < 0)
                {
                    return false;
                }

                var removed = _keys[index];
                _keys.RemoveAt(index);
                _validKeys.Remove(encoded);
                try
                {
                    Save();
                }
                catch
                {
                    _keys.Insert(index, removed);
                    _validKeys.Add(encoded);
                    throw;
                }

                return true;
            }
        }

        private void Save()
        {
            var directory = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(_keys, JsonOptions);
            var tempPath = _path + ".tmp";
            File.WriteAllText(tempPath, json);
            File.Move(tempPath, _path, overwrite: true);
        }
    }
}
