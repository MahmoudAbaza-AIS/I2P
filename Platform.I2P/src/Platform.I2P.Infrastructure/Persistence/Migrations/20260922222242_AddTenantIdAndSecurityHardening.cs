using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Platform.I2P.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantIdAndSecurityHardening : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FieldMappings_EndpointId_SourceField_TargetField",
                table: "FieldMappings");

            migrationBuilder.AddColumn<string>(
                name: "TenantId",
                table: "IntegrationEndpoints",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TenantId",
                table: "FieldMappings",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "IdempotencyKey",
                table: "ExchangeRecords",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(400)",
                oldMaxLength: 400);

            migrationBuilder.AddColumn<string>(
                name: "TenantId",
                table: "ExchangeRecords",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationEndpoints_TenantId_Name",
                table: "IntegrationEndpoints",
                columns: new[] { "TenantId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_FieldMappings_TenantId_EndpointId_SourceField_TargetField",
                table: "FieldMappings",
                columns: new[] { "TenantId", "EndpointId", "SourceField", "TargetField" });

            migrationBuilder.CreateIndex(
                name: "IX_ExchangeRecords_TenantId_ReceivedAtUtc",
                table: "ExchangeRecords",
                columns: new[] { "TenantId", "ReceivedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_IntegrationEndpoints_TenantId_Name",
                table: "IntegrationEndpoints");

            migrationBuilder.DropIndex(
                name: "IX_FieldMappings_TenantId_EndpointId_SourceField_TargetField",
                table: "FieldMappings");

            migrationBuilder.DropIndex(
                name: "IX_ExchangeRecords_TenantId_ReceivedAtUtc",
                table: "ExchangeRecords");

            migrationBuilder.DropColumn(
                name: "TenantId",
                table: "IntegrationEndpoints");

            migrationBuilder.DropColumn(
                name: "TenantId",
                table: "FieldMappings");

            migrationBuilder.DropColumn(
                name: "TenantId",
                table: "ExchangeRecords");

            migrationBuilder.AlterColumn<string>(
                name: "IdempotencyKey",
                table: "ExchangeRecords",
                type: "nvarchar(400)",
                maxLength: 400,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(500)",
                oldMaxLength: 500);

            migrationBuilder.CreateIndex(
                name: "IX_FieldMappings_EndpointId_SourceField_TargetField",
                table: "FieldMappings",
                columns: new[] { "EndpointId", "SourceField", "TargetField" });
        }
    }
}
