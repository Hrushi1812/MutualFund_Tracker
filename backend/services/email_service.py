"""
Email Service - Handles sending emails via Brevo (formerly Sendinblue) API
For development: emails are logged to console when BREVO_API_KEY is not set
For production: emails are sent via Brevo API
"""
import os
import requests
from core.logging import get_logger

logger = get_logger("EmailService")


class EmailService:
    def __init__(self):
        self.api_key = os.getenv("BREVO_API_KEY")
        self.from_email = os.getenv("BREVO_FROM_EMAIL", "noreply@mutualfundtracker.com")
        self.from_name = os.getenv("BREVO_FROM_NAME", "MutualFund Tracker")
        self.is_configured = bool(self.api_key)
        
        if self.is_configured:
            logger.info("Brevo email service configured")
        else:
            logger.warning("Brevo not configured. Emails will be logged to console only.")
    
    def send_email(self, to_email: str, subject: str, text_body: str, html_body: str = None) -> bool:
        """
        Send an email via Brevo API.
        Falls back to console logging if Brevo is not configured.
        """
        if not self.is_configured:
            # Development mode - log to console
            logger.info(f"[DEV MODE] Email would be sent to: {to_email}")
            logger.info(f"[DEV MODE] Subject: {subject}")
            logger.info(f"[DEV MODE] Body:\n{text_body}")
            print(f"\n{'='*50}")
            print(f"📧 EMAIL (Dev Mode)")
            print(f"To: {to_email}")
            print(f"Subject: {subject}")
            print(f"{'='*50}")
            print(text_body)
            print(f"{'='*50}\n")
            return True
        
        try:
            response = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": self.api_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                json={
                    "sender": {
                        "name": self.from_name,
                        "email": self.from_email
                    },
                    "to": [{"email": to_email}],
                    "subject": subject,
                    "textContent": text_body,
                    "htmlContent": html_body or text_body
                }
            )
            
            if response.status_code in [200, 201]:
                logger.info(f"Email sent successfully to {to_email}")
                return True
            else:
                logger.error(f"Brevo error: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False
    
    def send_password_reset_email(self, to_email: str, reset_url: str) -> bool:
        """Send password reset email with the reset link."""
        subject = "Password Reset - MutualFund Tracker"
        
        text_body = f"""
Hello,

You requested a password reset for your MutualFund Tracker account.

Click the link below to reset your password:
{reset_url}

This link will expire in 15 minutes.

If you didn't request this password reset, you can safely ignore this email.

Best regards,
MutualFund Tracker Team
        """.strip()
        
        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .button {{ 
            display: inline-block; 
            padding: 12px 24px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important; 
            text-decoration: none; 
            border-radius: 8px;
            font-weight: bold;
            margin: 20px 0;
        }}
        .footer {{ margin-top: 30px; font-size: 12px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <h2>Password Reset Request</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your MutualFund Tracker account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="{reset_url}" class="button">Reset Password</a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #667eea;">{reset_url}</p>
        <p><strong>This link will expire in 15 minutes.</strong></p>
        <p>If you didn't request this password reset, you can safely ignore this email.</p>
        <div class="footer">
            <p>Best regards,<br>MutualFund Tracker Team</p>
        </div>
    </div>
</body>
</html>
        """.strip()
        
        return self.send_email(to_email, subject, text_body, html_body)


# Singleton instance
email_service = EmailService()
