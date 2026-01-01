import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Crown, Loader2, ArrowRight, Mail } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/queryClient";


export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const { user, login, register, isLoggingIn, isRegistering } = useAuth();
  const { toast } = useToast();

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  if (user) {
    return <Redirect to="/" />;
  }

  const onSubmit = (data: InsertUser) => {
    if (isLogin) {
      login(data);
    } else {
      register(data);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
        toast({ title: "Lỗi", description: "Vui lòng nhập email của bạn", variant: "destructive" });
        return;
    }
    try {
      setIsResetLoading(true);
      const res = await fetch(API_BASE_URL + "/api/user/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Gửi email đặt lại mật khẩu thất bại");
      }

      toast({ title: "Đã gửi email", description: "Hãy kiểm tra hộp thư để lấy mã đặt lại mật khẩu." });
      setResetStep("confirm");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Có lỗi xảy ra, vui lòng thử lại";
      toast({ title: "Lỗi", description: message, variant: "destructive" });
    } finally {
      setIsResetLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetCode || !resetNewPassword) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng nhập đầy đủ email, mã và mật khẩu mới",
        variant: "destructive",
      });
      return;
    }
    setIsResetLoading(true);
    try {
      const res = await fetch(API_BASE_URL + "/api/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail,
          code: resetCode,
          newPassword: resetNewPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Đặt lại mật khẩu thất bại");
      }
      toast({
        title: "Thành công",
        description: "Mật khẩu mới đã được cập nhật, hãy đăng nhập lại.",
      });
      setIsForgotPassword(false);
      setResetStep("request");
      setResetEmail("");
      setResetCode("");
      setResetNewPassword("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại";
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsResetLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    toast({ title: "Đăng nhập Google", description: "Tính năng đăng nhập Google sẽ được tích hợp tại đây.", variant: "default" });
  };

  const isPending = isLoggingIn || isRegistering;

  if (isForgotPassword) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
          <div className="bg-glow-layer" />
          <div className="w-full max-w-md z-10">
            <div className="glass-card p-8 rounded-3xl animate-in zoom-in-95 duration-500">
                <h2 className="text-2xl font-bold text-white mb-2">
                  {resetStep === "request" ? "Quên mật khẩu" : "Nhập mã đặt lại mật khẩu"}
                </h2>
                <p className="text-slate-400 mb-6 text-sm">
                  {resetStep === "request"
                    ? "Nhập email đã gắn với tài khoản để nhận mã đặt lại mật khẩu."
                    : "Kiểm tra email để lấy mã, sau đó nhập mã và mật khẩu mới bên dưới."}
                </p>
                {resetStep === "request" ? (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase font-bold text-slate-500 tracking-wider ml-1">Email</label>
                      <Input
                        type="email"
                        placeholder="ban@example.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="glass-input h-12 rounded-xl text-lg font-medium"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-xl text-lg font-bold btn-primary"
                      disabled={isResetLoading}
                    >
                      {isResetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gửi mã về email"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setIsForgotPassword(false);
                        setResetStep("request");
                      }}
                      className="w-full text-slate-400 hover:text-white"
                    >
                      Quay lại đăng nhập
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs uppercase font-bold text-slate-500 tracking-wider ml-1">Email</label>
                      <Input
                        type="email"
                        placeholder="ban@example.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="glass-input h-11 rounded-xl text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase font-bold text-slate-500 tracking-wider ml-1">Mã đặt lại</label>
                      <Input
                        placeholder="Nhập mã gồm 6 số"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        className="glass-input h-11 rounded-xl text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase font-bold text-slate-500 tracking-wider ml-1">Mật khẩu mới</label>
                      <Input
                        type="password"
                        placeholder="Mật khẩu mới"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        className="glass-input h-11 rounded-xl text-base"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-xl text-lg font-bold btn-primary"
                      disabled={isResetLoading}
                    >
                      {isResetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Đổi mật khẩu"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setResetStep("request");
                        setResetCode("");
                        setResetNewPassword("");
                      }}
                      className="w-full text-slate-400 hover:text-white"
                    >
                      Quay lại bước gửi mã
                    </Button>
                  </form>
                )}
            </div>
          </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="bg-glow-layer" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
           <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-indigo-900/40 rotate-12 mb-6">
              <Crown className="w-8 h-8 text-white" />
           </div>
           <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white drop-shadow-lg mb-1">
             Chess<span className="text-indigo-500">Pro</span>
           </h1>
           <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">
             cờ vua của người việt
           </p>
        </div>

        <div className="glass-card p-8 rounded-3xl animate-in zoom-in-95 duration-500">
          <div className="flex w-full mb-8 bg-slate-900/50 p-1 rounded-xl">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                isLogin ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              ĐĂNG NHẬP
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                !isLogin ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              ĐĂNG KÝ
            </button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase font-bold text-slate-500 tracking-wider ml-1">Tên đăng nhập</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Kythu123" 
                        {...field} 
                        className="glass-input h-12 rounded-xl text-lg font-medium"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase font-bold text-slate-500 tracking-wider ml-1">Mật khẩu</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field} 
                        className="glass-input h-12 rounded-xl text-lg font-medium"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isLogin && (
                  <div className="flex justify-end">
                      <button 
                        type="button"
                        onClick={() => setIsForgotPassword(true)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                      >
                          Quên mật khẩu?
                      </button>
                  </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl text-lg font-bold mt-6 btn-primary"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {isLogin ? "Bắt đầu chơi" : "Tạo tài khoản"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>

              <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-700"></span>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-[#0f172a] px-2 text-slate-500">Hoặc tiếp tục với</span>
                  </div>
              </div>

              <Button 
                type="button" 
                variant="outline" 
                onClick={handleGoogleLogin}
                className="w-full h-12 rounded-xl border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-white font-bold"
              >
                  <Mail className="w-4 h-4 mr-2 text-red-500" />
                  Đăng nhập bằng Gmail
              </Button>

            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
