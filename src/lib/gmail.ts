import nodemailer from 'nodemailer';

export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
    try {
        console.log(`[Gmail SMTP] Attempting to send email to ${to}`);

        const user = process.env.GMAIL_USER;
        const pass = process.env.GMAIL_APP_PASSWORD;

        if (!user || !pass) {
            throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables");
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: user,
                pass: pass,
            },
        });

        const info = await transporter.sendMail({
            from: `"Tax Classifier" <${user}>`, // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            text: text, // plain text body
            html: html, // html body
        });

        console.log(`[Gmail SMTP] Email sent: ${info.messageId}`);
        return { success: true, messageId: info.messageId };

    } catch (error: any) {
        console.error('[Gmail SMTP] Failed to send email:', error);
        throw error;
    }
};
