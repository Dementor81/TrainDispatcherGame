using Microsoft.Extensions.Configuration;

namespace TrainDispatcherGame.Server.Services
{
    public class AdminCodeValidator
    {
        private readonly string _encodedCode;

        public AdminCodeValidator(IConfiguration configuration)
        {
            _encodedCode = configuration["Admin:Code"]?.Trim() ?? string.Empty;
        }

        private bool IsConfigured => _encodedCode.Length > 0;

        public bool IsValid(string? code) =>
            IsConfigured
            && !string.IsNullOrWhiteSpace(code)
            && string.Equals(LicenceKeyValidator.Encode(code), _encodedCode, StringComparison.Ordinal);
    }
}
