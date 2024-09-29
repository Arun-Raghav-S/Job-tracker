// app/dashboard/page.js

'use client';

import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
// import { useToast } from '@/components/hooks/use-toast'; // Correct import for useToast

export default function Dashboard() {
  const { data: session, status } = useSession();
  const { toast } = useToast(); // Destructure toast from useToast
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (session) {
      fetchEmails();
    } else if (status !== 'loading') {
      signIn();
    }
  }, [session, status]);

  const fetchEmails = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/get-emails');
      const data = await res.json();
      setEmails(data.emails);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch sent emails.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <Skeleton className="w-32 h-8" />
        <Skeleton className="w-full h-96" />
      </div>
    );
  }

  if (!session) {
    return <p>Redirecting to login...</p>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const toEmail = e.target.toEmail.value;
    const subject = e.target.subject.value;
    const message = e.target.message.value;
    const resume = e.target.resume.files[0];

    // Basic Client-Side Validation
    if (!validateEmail(toEmail)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
      });
      return;
    }

    setIsLoading(true);

    const formData = new FormData();
    formData.append('toEmail', toEmail);
    formData.append('subject', subject);
    formData.append('message', message);
    formData.append('resume', resume);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Email sent successfully!',
        });
        // Optionally refresh the emails list
        fetchEmails();
      } else {
        toast({
          title: 'Error',
          description: `Failed to send email: ${result.error}`,
        });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: 'Unexpected Error',
        description: 'An unexpected error occurred while sending the email.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Email Form */}
        <Card className="p-6 shadow-lg">
          <h1 className="text-2xl font-bold mb-6">Send Email</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="toEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Recruiter's Email
              </Label>
              <Input
                type="email"
                id="toEmail"
                name="toEmail"
                placeholder="nemesis29122002@gmail.com"
                required
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </Label>
              <Input
                type="text"
                id="subject"
                name="subject"
                placeholder="Job Application"
                required
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </Label>
              <Textarea
                id="message"
                name="message"
                placeholder="Your message here..."
                required
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="resume" className="block text-sm font-medium text-gray-700 mb-1">
                Resume
              </Label>
              <Input
                type="file"
                id="resume"
                name="resume"
                accept=".pdf,.doc,.docx"
                required
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Application'}
            </Button>
          </form>
        </Card>

        {/* Sent Emails Table */}
        <Card className="p-6 shadow-lg">
          <h2 className="text-xl font-bold mb-6">Sent Emails</h2>
          {isLoading ? (
            <Skeleton className="w-full h-48" />
          ) : emails.length === 0 ? (
            <p>No emails sent yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <th className="px-4 py-2">Recruiter's Email</th>
                    <th className="px-4 py-2">Subject</th>
                    <th className="px-4 py-2">Timestamp</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((email) => (
                    <tr key={email.id} className="border-t">
                      <td className="px-4 py-2">{email.toEmail}</td>
                      <td className="px-4 py-2">{email.subject}</td>
                      <td className="px-4 py-2">
                        {new Date(email.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">{email.status}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
