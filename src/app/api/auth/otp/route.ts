import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/gmail';

export async function POST(request: Request) {
    try {
        const { email, otp, type } = await request.json(); // Added type for subject context

        if (!email || !otp) {
            return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
        }

        const subject = type === 'forgot-password'
            ? "Your Password Reset Code"
            : "Verify Your Account";

        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2>${subject}</h2>
                <p>Hello,</p>
                <p>Your verification code is:</p>
                <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 2px;">${otp}</h1>
                <p>This code will expire in 10 minutes.</p>
                <p>If you didn't request this code, you can safely ignore this email.</p>
                <br/>
                <p>Best regards,<br/>The 10xClassify Team</p>
            </div>
        `;

        const result = await sendEmail(email, subject, `Your verification code is: ${otp}`, html);

        return NextResponse.json({
            success: true,
            message: "OTP sent via Gmail",
            messageId: result.messageId
        });

    } catch (error: any) {
        console.error("OTP Email Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to send OTP",
            details: error.toString()
        }, { status: 500 });
    }
}
