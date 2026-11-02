using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Platform.I2P.Infrastructure.Messaging;

public sealed class MessagingOptions
{
    public const string SectionName = "Messaging:RabbitMq";

    public string Host { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(Host) &&
        !string.IsNullOrWhiteSpace(Username) &&
        !string.IsNullOrWhiteSpace(Password);
}

/// <summary>Outbox delivery / dead-letter knobs (WP1).</summary>
public sealed class OutboxDeliveryOptions
{
    public const string SectionName = "Outbox";

    public int MaxAttempts { get; set; } = 5;
    public int DeadLetterAgeSeconds { get; set; } = 300;
    public int SweepIntervalSeconds { get; set; } = 15;
}

public sealed class MessagingOptionsValidator : IValidateOptions<MessagingOptions>
{
    private readonly IHostEnvironment _environment;

    public MessagingOptionsValidator(IHostEnvironment environment) => _environment = environment;

    public ValidateOptionsResult Validate(string? name, MessagingOptions options)
    {
        if (_environment.IsDevelopment())
        {
            return ValidateOptionsResult.Success;
        }

        if (!options.IsConfigured)
        {
            return ValidateOptionsResult.Fail(
                "Messaging:RabbitMq Host/Username/Password are required outside Development (WP1 D-02).");
        }

        return ValidateOptionsResult.Success;
    }
}
