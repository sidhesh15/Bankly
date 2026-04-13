/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  PieChart as PieChartIcon, 
  List, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Plus,
  ArrowRight,
  Loader2,
  Wallet,
  LogOut,
  LogIn,
  History,
  Settings,
  Target,
  Trash2
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';
import { collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Transaction, AnalysisResult, DEFAULT_CATEGORIES } from './types';
import { extractTextFromPDF } from './lib/pdf-parser';
import { categorizeTransactions } from './lib/gemini';
import { cn } from './lib/utils';
import { useAuth } from './lib/auth-context';
import { db, handleFirestoreError, OperationType } from './lib/firebase';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];

export default function App() {
  const { user, profile, loading: authLoading, login, logout, updateBudgets } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [tempBudgets, setTempBudgets] = useState<Record<string, number>>({});
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  const allCategories = useMemo(() => {
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories]));
  }, [customCategories]);

  // Load history
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'analyses'),
      where('uid', '==', user.uid),
      orderBy('analyzedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const analyses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AnalysisResult[];
      setHistory(analyses);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'analyses');
    });

    return () => unsubscribe();
  }, [user]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const text = await extractTextFromPDF(file);
      const rawTransactions = await categorizeTransactions(text);
      
      const transactions: Transaction[] = rawTransactions.map((t, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        date: t.date || 'Unknown',
        description: t.description || 'No Description',
        amount: Math.abs(t.amount || 0),
        type: t.type as any || 'expense',
        category: t.category || 'Other',
        isResolved: t.category !== 'Other'
      }));

      const totalIncome = transactions
        .filter(t => t.type === 'income' && t.category !== 'Transfer')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalExpenses = transactions
        .filter(t => t.type === 'expense' && t.category !== 'Transfer')
        .reduce((sum, t) => sum + t.amount, 0);

      const categories: Record<string, number> = {};
      const incomeCategories: Record<string, number> = {};
      transactions.forEach(t => {
        if (t.category === 'Transfer') return;
        if (t.type === 'expense') {
          categories[t.category] = (categories[t.category] || 0) + t.amount;
        } else {
          incomeCategories[t.category] = (incomeCategories[t.category] || 0) + t.amount;
        }
      });

      const analysis: AnalysisResult = {
        transactions,
        totalIncome,
        totalExpenses,
        categories,
        incomeCategories,
        fileName: file.name,
        analyzedAt: new Date().toISOString()
      };

      // Save to Firebase if logged in
      if (user) {
        await addDoc(collection(db, 'analyses'), {
          ...analysis,
          uid: user.uid
        });
      }

      setResult(analysis);
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      setError('Failed to analyze the statement. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteAnalysis = async (id: string) => {
    if (!user || !id) return;
    try {
      await deleteDoc(doc(db, 'analyses', id));
      if (result?.id === id) setResult(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `analyses/${id}`);
    }
  };

  const saveBudgets = async () => {
    await updateBudgets(tempBudgets);
    setIsBudgetDialogOpen(false);
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.categories).map(([name, value]) => ({
      name,
      value: value as number
    })).sort((a, b) => b.value - a.value);
  }, [result]);

  const incomeChartData = useMemo(() => {
    if (!result || !result.incomeCategories) return [];
    return Object.entries(result.incomeCategories).map(([name, value]) => ({
      name,
      value: value as number
    })).sort((a, b) => b.value - a.value);
  }, [result]);

  const incomeVsExpenseData = useMemo(() => {
    if (!result) return [];
    return [
      { name: 'Income', amount: result.totalIncome },
      { name: 'Expenses', amount: result.totalExpenses }
    ];
  }, [result]);

  const filteredTransactions = useMemo(() => {
    if (!result) return [];
    if (!filterCategory) return result.transactions;
    return result.transactions.filter(t => t.category === filterCategory);
  }, [result, filterCategory]);

  const addCustomCategory = () => {
    if (newCategoryName && !allCategories.includes(newCategoryName)) {
      setCustomCategories([...customCategories, newCategoryName]);
      setNewCategoryName('');
      return newCategoryName;
    }
    return null;
  };

  const updateTransactionCategory = (transactionId: string, newCat: string) => {
    if (!result) return;

    const updatedTransactions = result.transactions.map(tr => 
      tr.id === transactionId ? { ...tr, category: newCat } : tr
    );
    
    // Recalculate categories
    const newCategories: Record<string, number> = {};
    const newIncomeCategories: Record<string, number> = {};
    
    const newTotalIncome = updatedTransactions
      .filter(tr => tr.type === 'income' && tr.category !== 'Transfer')
      .reduce((sum, tr) => sum + tr.amount, 0);
    
    const newTotalExpenses = updatedTransactions
      .filter(tr => tr.type === 'expense' && tr.category !== 'Transfer')
      .reduce((sum, tr) => sum + tr.amount, 0);

    updatedTransactions.forEach(tr => {
      if (tr.category === 'Transfer') return;
      if (tr.type === 'expense') {
        newCategories[tr.category] = (newCategories[tr.category] || 0) + tr.amount;
      } else {
        newIncomeCategories[tr.category] = (newIncomeCategories[tr.category] || 0) + tr.amount;
      }
    });

    setResult({
      ...result,
      transactions: updatedTransactions,
      totalIncome: newTotalIncome,
      totalExpenses: newTotalExpenses,
      categories: newCategories,
      incomeCategories: newIncomeCategories
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setResult(null)}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Wallet className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Bankly<span className="text-blue-600">AI</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-semibold text-slate-800">{user.displayName || 'User'}</span>
                  <span className="text-[10px] text-slate-500">{user.email}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={logout} title="Logout">
                  <LogOut className="w-5 h-5 text-slate-500" />
                </Button>
              </div>
            ) : (
              <Button onClick={login} className="bg-blue-600 hover:bg-blue-700">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto space-y-12"
            >
              <div className="text-center">
                <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
                  Understand your spending <br />
                  <span className="text-blue-600">in seconds.</span>
                </h2>
                <p className="text-lg text-slate-600 max-w-lg mx-auto">
                  Upload your bank statement PDF and let our AI categorize your transactions and provide deep financial insights.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <Card className="border-2 border-dashed border-slate-200 bg-white hover:border-blue-400 transition-colors group relative overflow-hidden">
                    <CardContent className="p-12 flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                        <Upload className="w-10 h-10 text-blue-600" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Upload your statement</h3>
                      <p className="text-slate-500 mb-8">Drag and drop your PDF here, or click to browse</p>
                      <div className="relative">
                        <Button disabled={isAnalyzing} className="px-8 py-6 rounded-xl text-lg shadow-xl shadow-blue-100 bg-blue-600 hover:bg-blue-700">
                          {isAnalyzing ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Analyzing...</> : "Select PDF File"}
                        </Button>
                        <input type="file" accept=".pdf" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isAnalyzing} />
                      </div>
                      {error && <div className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg"><AlertCircle className="w-4 h-4" /><span className="text-sm font-medium">{error}</span></div>}
                    </CardContent>
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center">
                        <div className="w-64 space-y-4">
                          <Progress value={undefined} className="h-2" />
                          <p className="text-center text-sm font-medium text-slate-600 animate-pulse">AI is reading your statement...</p>
                        </div>
                      </div>
                    )}
                  </Card>

                  {!user && (
                    <Card className="bg-blue-600 border-none text-white overflow-hidden relative">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <TrendingUp className="w-32 h-32" />
                      </div>
                      <CardHeader>
                        <CardTitle>Save your history</CardTitle>
                        <CardDescription className="text-blue-100">Sign in to securely store your statements and track your progress over time.</CardDescription>
                      </CardHeader>
                      <CardFooter>
                        <Button variant="secondary" onClick={login} className="w-full sm:w-auto">Sign In with Google</Button>
                      </CardFooter>
                    </Card>
                  )}
                </div>

                <div className="space-y-6">
                  <Card className="bg-white shadow-sm border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <History className="w-4 h-4 text-blue-600" />
                        Recent History
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                      <ScrollArea className="h-[300px] px-4">
                        {history.length > 0 ? (
                          <div className="space-y-3">
                            {history.map((item) => (
                              <div key={item.id} className="group flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer" onClick={() => setResult(item)}>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-medium truncate text-slate-800">{item.fileName}</span>
                                  <span className="text-[10px] text-slate-500">{new Date(item.analyzedAt!).toLocaleDateString()}</span>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); deleteAnalysis(item.id!); }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                            <FileText className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-xs">No history yet</p>
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden group">
                  <div className="h-1 bg-emerald-500 w-full" />
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-500" />Total Income</CardDescription>
                    <CardTitle className="text-3xl font-bold text-slate-900">₹{result.totalIncome.toLocaleString()}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden group">
                  <div className="h-1 bg-red-500 w-full" />
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-500" />Total Expenses</CardDescription>
                    <CardTitle className="text-3xl font-bold text-slate-900">₹{result.totalExpenses.toLocaleString()}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden group">
                  <div className={cn("h-1 w-full", result.totalIncome - result.totalExpenses >= 0 ? "bg-blue-500" : "bg-orange-500")} />
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1"><Wallet className="w-3 h-3 text-blue-500" />Net Savings</CardDescription>
                    <CardTitle className={cn("text-3xl font-bold", result.totalIncome - result.totalExpenses >= 0 ? "text-slate-900" : "text-orange-600")}>
                      ₹{(result.totalIncome - result.totalExpenses).toLocaleString()}
                    </CardTitle>
                    {result.totalExpenses > result.totalIncome && (
                      <p className="text-[10px] text-orange-500 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Spending from existing balance
                      </p>
                    )}
                  </CardHeader>
                </Card>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between mb-6">
                  <TabsList className="bg-slate-100 p-1 rounded-xl">
                    <TabsTrigger value="overview" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"><PieChartIcon className="w-4 h-4 mr-2" />Overview</TabsTrigger>
                    <TabsTrigger value="budgets" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"><Target className="w-4 h-4 mr-2" />Budgets</TabsTrigger>
                    <TabsTrigger value="transactions" className="rounded-lg px-6 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"><List className="w-4 h-4 mr-2" />Transactions</TabsTrigger>
                  </TabsList>
                  
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => setResult(null)} className="hidden sm:flex">New Analysis</Button>
                    <Dialog open={isBudgetDialogOpen} onOpenChange={(open) => { if(open) setTempBudgets(profile?.budgets || {}); setIsBudgetDialogOpen(open); }}>
                      <DialogTrigger 
                        nativeButton={false}
                        render={<Button variant="outline" size="sm" className="bg-white" />}
                      >
                        <Settings className="w-4 h-4 mr-2" />Set Budgets
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Budget Settings</DialogTitle>
                          <DialogDescription>Define monthly spending limits for each category.</DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-[300px] pr-4">
                          <div className="space-y-4 py-4">
                            <div className="flex gap-2 mb-4">
                              <Input 
                                placeholder="New category name" 
                                value={newCategoryName} 
                                onChange={(e) => setNewCategoryName(e.target.value)}
                              />
                              <Button onClick={addCustomCategory} size="sm"><Plus className="w-4 h-4" /></Button>
                            </div>
                            {allCategories.filter(c => !['Salary', 'Investment', 'Transfer'].includes(c)).map(cat => (
                              <div key={cat} className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right text-xs">{cat}</Label>
                                <Input type="number" className="col-span-3" value={tempBudgets[cat] || ''} onChange={(e) => setTempBudgets({...tempBudgets, [cat]: parseFloat(e.target.value) || 0})} placeholder="0.00" />
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                        <DialogFooter><Button onClick={saveBudgets}>Save Changes</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <TabsContent value="overview" className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-white shadow-sm border-slate-200">
                      <CardHeader><CardTitle className="text-lg font-semibold">Expense Breakdown</CardTitle></CardHeader>
                      <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={chartData} 
                              cx="50%" 
                              cy="50%" 
                              innerRadius={60} 
                              outerRadius={100} 
                              paddingAngle={5} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              onClick={(data) => {
                                setFilterCategory(data.name);
                                setActiveTab('transactions');
                              }}
                              className="cursor-pointer"
                            >
                              {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount']} />
                            <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="bg-white shadow-sm border-slate-200">
                      <CardHeader><CardTitle className="text-lg font-semibold">Income Breakdown</CardTitle></CardHeader>
                      <CardContent className="h-[400px]">
                        {incomeChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie 
                                data={incomeChartData} 
                                cx="50%" 
                                cy="50%" 
                                innerRadius={60} 
                                outerRadius={100} 
                                paddingAngle={5} 
                                dataKey="value"
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                onClick={(data) => {
                                  setFilterCategory(data.name);
                                  setActiveTab('transactions');
                                }}
                                className="cursor-pointer"
                              >
                                {incomeChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />)}
                              </Pie>
                              <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount']} />
                              <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <TrendingUp className="w-12 h-12 mb-2 opacity-20" />
                            <p>No income data found</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-white shadow-sm border-slate-200 lg:col-span-2">
                      <CardHeader><CardTitle className="text-lg font-semibold">Income vs Expenses</CardTitle></CardHeader>
                      <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={incomeVsExpenseData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(val) => `₹${val}`} />
                            <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                              {incomeVsExpenseData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.name === 'Income' ? '#10b981' : '#ef4444'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="budgets" className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(result.categories).map(([cat, spent]) => {
                      const limit = profile?.budgets?.[cat] || 0;
                      const spentAmount = spent as number;
                      const percent = limit > 0 ? (spentAmount / limit) * 100 : 0;
                      const isOver = spentAmount > limit && limit > 0;
                      
                      return (
                        <Card key={cat} className={cn("bg-white shadow-sm border-slate-200", isOver && "border-red-200 bg-red-50/10")}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-sm font-bold">{cat}</CardTitle>
                              {isOver && <Badge variant="destructive" className="text-[10px]">Over Budget</Badge>}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Spent: <span className="font-bold text-slate-900">₹{spent.toLocaleString()}</span></span>
                              <span className="text-slate-500">Limit: <span className="font-bold text-slate-900">₹{limit > 0 ? limit.toLocaleString() : 'N/A'}</span></span>
                            </div>
                            {limit > 0 ? (
                              <div className="space-y-1">
                                <Progress value={Math.min(percent, 100)} className={cn("h-2", percent > 90 ? "bg-red-100" : "bg-slate-100")} />
                                <p className={cn("text-[10px] text-right font-medium", percent > 90 ? "text-red-600" : "text-slate-500")}>
                                  {percent.toFixed(1)}% of budget used
                                </p>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400 italic">No budget set for this category</p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="transactions">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {filterCategory && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 flex items-center gap-1 py-1 px-3">
                          Filtering: {filterCategory}
                          <Trash2 className="w-3 h-3 cursor-pointer" onClick={() => setFilterCategory(null)} />
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{filteredTransactions.length} transactions found</p>
                  </div>
                  <Card className="bg-white shadow-sm border-slate-200 overflow-hidden">
                    <ScrollArea className="h-[600px]">
                      <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="w-[120px]">Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.map((t) => (
                            <TableRow key={t.id} className="group hover:bg-slate-50/50 transition-colors">
                              <TableCell className="text-slate-500 text-sm">{t.date}</TableCell>
                              <TableCell className="font-medium text-slate-800">
                                <div className="flex flex-col">
                                  <span>{t.description}</span>
                                  {t.type === 'income' && <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Credit</span>}
                                  {t.category === 'Transfer' && <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">Contra / Transfer</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Dialog>
                                  <DialogTrigger 
                                    nativeButton={false}
                                    render={
                                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-transparent cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors" />
                                    }
                                  >
                                    {t.category}
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                      <DialogTitle>Change Category</DialogTitle>
                                      <DialogDescription>Select an existing category or create a new one for this transaction.</DialogDescription>
                                    </DialogHeader>
                                    
                                    <div className="flex gap-2 mt-4 mb-2">
                                      <Input 
                                        placeholder="Add new category (e.g. Movie, Loan to friend)" 
                                        value={newCategoryName} 
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        className="text-xs"
                                      />
                                      <Button 
                                        size="sm" 
                                        onClick={() => {
                                          const added = addCustomCategory();
                                          if (added) updateTransactionCategory(t.id, added);
                                        }}
                                      >
                                        <Plus className="w-4 h-4" />
                                      </Button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 py-4">
                                      {allCategories.map(cat => (
                                        <Button 
                                          key={cat} 
                                          variant={t.category === cat ? "default" : "outline"}
                                          className="justify-start text-xs"
                                          onClick={() => updateTransactionCategory(t.id, cat)}
                                        >
                                          {cat}
                                        </Button>
                                      ))}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </TableCell>
                              <TableCell className={cn("text-right font-bold", t.type === 'income' ? "text-emerald-600" : "text-slate-900")}>
                                {t.type === 'income' ? '+' : '-'}₹{t.amount.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </Card>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto py-8 border-t bg-white">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-slate-500">&copy; 2024 BanklyAI. All statements are processed securely.</p>
        </div>
      </footer>
    </div>
  );
}
