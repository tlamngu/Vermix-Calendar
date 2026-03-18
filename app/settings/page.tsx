'use client';

import { useAuth } from '@/components/auth-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogOut, Key, Trash2, Copy, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import Select from 'react-select';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [mcpKeys, setMcpKeys] = useState<{ id: string, key: string, createdAt: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [timezone, setTimezone] = useState('UTC');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const timezoneOptions = (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl)
    ? Intl.supportedValuesOf('timeZone').map(tz => ({ value: tz, label: tz }))
    : [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Australia/Sydney'
    ].map(tz => ({ value: tz, label: tz }));

  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: 'var(--color-bg-primary)',
      borderColor: state.isFocused ? 'var(--color-border-focus)' : 'var(--color-border-default)',
      color: 'var(--color-text-primary)',
      borderRadius: '0 !important',
      boxShadow: 'none !important',
      minHeight: '48px',
      '&:hover': {
        borderColor: 'var(--color-border-strong)',
      }
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '0 !important',
      border: '1px solid var(--color-border-default)',
      boxShadow: 'none !important',
      zIndex: 50,
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? 'var(--color-surface-selected)' 
        : state.isFocused 
          ? 'var(--color-surface-hover)' 
          : 'transparent',
      color: 'var(--color-text-primary)',
      borderRadius: '0 !important',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: 'var(--color-surface-active)',
      }
    }),
    singleValue: (base: any) => ({
      ...base,
      color: 'var(--color-text-primary)',
    }),
    input: (base: any) => ({
      ...base,
      color: 'var(--color-text-primary)',
    }),
    placeholder: (base: any) => ({
      ...base,
      color: 'var(--color-text-placeholder)',
    }),
    dropdownIndicator: (base: any) => ({
      ...base,
      color: 'var(--color-text-tertiary)',
      '&:hover': {
        color: 'var(--color-text-secondary)',
      }
    }),
    indicatorSeparator: (base: any) => ({
      ...base,
      backgroundColor: 'var(--color-border-subtle)',
    }),
    clearIndicator: (base: any) => ({
      ...base,
      color: 'var(--color-text-tertiary)',
    }),
  };

  useEffect(() => {
    if (!user) return;
    const fetchKeys = async () => {
      const { data, error } = await supabase
        .from('mcp_keys')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Supabase Error fetching keys:", error);
      } else if (data) {
        setMcpKeys(data.map(k => ({ id: k.id, key: k.key, createdAt: k.created_at })));
      }
    };

    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('reminder_minutes, timezone')
        .eq('user_id', user.id)
        .single();
      
      if (data && !error) {
        setReminderMinutes(data.reminder_minutes);
        if (data.timezone) setTimezone(data.timezone);
      }
    };

    fetchKeys();
    fetchSettings();
  }, [user]);

  const saveReminderSettings = async (minutes: number) => {
    if (!user) return;
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ 
          user_id: user.id, 
          reminder_minutes: minutes,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) throw error;
      setReminderMinutes(minutes);
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveTimezoneSettings = async (tz: string) => {
    if (!user) return;
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ 
          user_id: user.id, 
          timezone: tz,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) throw error;
      setTimezone(tz);
    } catch (error) {
      console.error('Error saving timezone settings:', error);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const generateKey = async () => {
    if (!user) return;
    setIsGenerating(true);
    try {
      const newKey = 'mcp_sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const { data, error } = await supabase
        .from('mcp_keys')
        .insert([{
          key: newKey,
          user_id: user.id,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setMcpKeys(prev => {
          if (prev.find(k => k.id === data.id)) return prev;
          return [{ id: data.id, key: data.key, createdAt: data.created_at }, ...prev];
        });
      }
    } catch (error) {
      console.error('Error generating key:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteKey = async (id: string) => {
    try {
      const { error } = await supabase
        .from('mcp_keys')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      setMcpKeys(mcpKeys.filter(k => k.id !== id));
    } catch (error) {
      console.error('Error deleting key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-[var(--text-2xl)] font-semibold text-text-primary tracking-tight mb-6">Settings</h2>
      
      <div className="space-y-6">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
          <Card className="p-6">
            <h3 className="text-[clamp(16px,2vw,18px)] font-medium text-text-primary mb-4">Account</h3>
            <div className="flex items-center gap-4 mb-6">
              {user?.user_metadata?.avatar_url && (
                <img src={user.user_metadata.avatar_url} alt="Profile" className="w-16 h-16 object-cover rounded-full" />
              )}
              <div>
                <div className="text-text-primary font-medium">{user?.user_metadata?.full_name || user?.email}</div>
                <div className="text-text-secondary text-sm">{user?.email}</div>
              </div>
            </div>
            <Button variant="danger" onClick={() => logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-accent-blue" />
              <h3 className="text-[clamp(16px,2vw,18px)] font-medium text-text-primary">Notifications</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-secondary block mb-2">
                  Reminder Time
                </label>
                <p className="text-xs text-text-tertiary mb-4">
                  How many minutes before an event or task should we notify you?
                </p>
                <div className="flex flex-wrap gap-3">
                  {[5, 10, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => saveReminderSettings(mins)}
                      disabled={isSavingSettings}
                      className={`flex-1 min-w-[80px] h-12 flex items-center justify-center text-sm font-medium border transition-all rounded-md ${
                        reminderMinutes === mins
                          ? 'bg-accent-blue border-accent-blue text-white'
                          : 'bg-bg-primary border-border-default text-text-secondary hover:border-accent-blue/50'
                      } disabled:opacity-50 active:scale-95`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border-default pt-4 mt-4">
                <label className="text-sm font-medium text-text-secondary block mb-2">
                  Timezone
                </label>
                <p className="text-xs text-text-tertiary mb-4">
                  Select your local timezone for accurate time-based tasks and reminders.
                </p>
                <Select
                  value={timezoneOptions.find(opt => opt.value === timezone)}
                  onChange={(opt: any) => saveTimezoneSettings(opt.value)}
                  options={timezoneOptions}
                  styles={selectStyles}
                  isDisabled={isSavingSettings}
                  placeholder="Search timezone..."
                  classNamePrefix="react-select"
                />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6">
            <h3 className="text-[clamp(16px,2vw,18px)] font-medium text-text-primary mb-4">MCP Server Configuration</h3>
            <p className="text-text-secondary text-sm mb-4">
              Your AI Agent can connect to this application using the Model Context Protocol (MCP).
              Configure your agent to send JSON-RPC requests to the endpoint below.
            </p>
            <div className="bg-bg-primary p-3 border border-border-default text-sm font-mono text-accent-blue break-all mb-6">
              {typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp'}
            </div>
            
            <div className="border-t border-border-default pt-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-[clamp(14px,1.8vw,16px)] font-medium text-text-primary">API Keys</h4>
                <Button onClick={generateKey} disabled={isGenerating} className="h-8 px-3 text-xs">
                  <Key className="w-4 h-4 mr-2" />
                  Generate New Key
                </Button>
              </div>
              
              {mcpKeys.length === 0 ? (
                <p className="text-sm text-text-tertiary italic">No API keys generated yet.</p>
              ) : (
                <div className="space-y-3">
                  {mcpKeys.map((k) => (
                    <div key={k.id} className="flex items-center justify-between bg-surface-default border border-border-subtle p-3 rounded-md">
                      <div>
                        <div className="font-mono text-sm text-text-primary">{k.key}</div>
                        <div className="text-xs text-text-tertiary">Created: {new Date(k.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => copyToClipboard(k.key)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-accent-red hover:text-accent-red hover:bg-accent-red/10" onClick={() => deleteKey(k.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-text-tertiary text-xs mt-4">
                * Note: Provide this API key to your AI agent as a Bearer token in the Authorization header.
              </p>
            </div>
          </Card>
        </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
