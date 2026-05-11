import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  CreditCard,
  Database,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  Unlock,
  Users,
  Wallet,
  X
} from 'lucide-react';

const STORAGE_KEY = 'infinilink_admin_session';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1').replace(/\/+$/, '');

const ILLUSTRATIONS = {
  login: '/illustrations/astronaut-rafiki.png',
  empty: '/illustrations/no-data-cuate.png',
  users: '/illustrations/people-search-amico.png',
  content: '/illustrations/social-media-rafiki.png',
  circles: '/illustrations/circles-rafiki.png',
  revenue: '/illustrations/savings-cuate.png',
  messages: '/illustrations/messaging-fun-rafiki.png',
  system: '/illustrations/world-rafiki.png',
  dashboard: '/illustrations/outer-space-rafiki.png'
};

const AD_SLOT_OPTIONS = [
  { value: 'feed_stream', label: '信息流广告位', desc: '穿插在内容流中展示的单卡广告。' },
  { value: 'home_carousel', label: '首页轮播广告位', desc: '首页顶部轮播广告，可配置多张。' },
  { value: 'splash_screen', label: '开屏广告位', desc: '进入首页时优先展示的开屏广告。' },
  { value: 'post_detail_inline', label: '文章详情广告位', desc: '帖子详情页正文下方的广告位。' }
];

const DEFAULT_GROWTH_THRESHOLDS = [0, 12000, 32000, 70000, 140000, 260000, 440000, 700000, 1060000, 1560000];

const NAVIGATION = [
  { section: '核心看板', items: [{ id: 'dashboard', label: '总览仪表盘', icon: LayoutDashboard }] },
  { section: '用户与内容', items: [
    { id: 'users', label: '用户管理', icon: Users },
    { id: 'verification', label: '认证审核', icon: ShieldCheck },
    { id: 'content', label: '内容管理', icon: FileText },
    { id: 'circles', label: '圈子管理', icon: MessageSquare }
  ]},
  { section: '安全与客服', items: [
    { id: 'risk', label: '举报与风控', icon: AlertTriangle },
    { id: 'messages', label: '消息与客服', icon: Bell },
    { id: 'tickets', label: '反馈与工单', icon: HelpCircle }
  ]},
  { section: '财务与配置', items: [
    { id: 'orders', label: '订单会员支付', icon: CreditCard },
    { id: 'revenue', label: '收益与提现', icon: Wallet },
    { id: 'ads', label: '广告管理', icon: ImageIcon },
    { id: 'sys', label: '系统配置', icon: Settings }
  ]},
  { section: '技术基建', items: [
    { id: 'devops', label: '高可用监控', icon: Activity },
    { id: 'auth', label: '权限管理', icon: Lock }
  ]}
];

function getActionLabel(action) {
  const labels = {
    approve: '通过',
    reject: '驳回',
    hide: '下架',
    restore: '恢复',
    processing: '处理中',
    resolve: '处理完成',
    reopen: '重新打开',
    ban: '封禁',
    unban: '解除封禁',
    mute: '禁言',
    unmute: '解除禁言',
    grant_vip: '赠送会员',
    revoke_vip: '取消会员'
  };
  return labels[action] || action;
}

function createOperationAdDraft(overrides = {}) {
  return {
    id: `ad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slot: 'feed_stream',
    title: '',
    subtitle: '',
    image_url: '',
    action_type: 'path',
    action_value: '',
    button_text: '立即查看',
    enabled: true,
    sort_order: 10,
    ...overrides
  };
}

function createMembershipPlanDraft(overrides = {}) {
  const draft = {
    code: 'pro',
    name: 'Pro',
    badge_text: 'PRO',
    tagline: '',
    description: '',
    button_text: '立即开通',
    price: 99,
    duration_days: 30,
    benefits: [],
    growth_bonus_score: 3000,
    growth_multiplier_percent: 115,
    temporary_only: true,
    enabled: true,
    sort_order: 10,
    ...overrides
  };
  if (draft.code === 'max') {
    draft.growth_bonus_score = Number(draft.growth_bonus_score || 9000);
    draft.growth_multiplier_percent = Number(draft.growth_multiplier_percent || 135);
  } else {
    draft.growth_bonus_score = Number(draft.growth_bonus_score || 3000);
    draft.growth_multiplier_percent = Number(draft.growth_multiplier_percent || 115);
  }
  draft.temporary_only = draft.temporary_only !== false;
  return draft;
}

function createGrowthRulesDraft(overrides = {}) {
  const sourceThresholds = Array.isArray(overrides.level_thresholds) && overrides.level_thresholds.length
    ? overrides.level_thresholds
    : DEFAULT_GROWTH_THRESHOLDS;
  const thresholds = DEFAULT_GROWTH_THRESHOLDS.map((fallback, index) => Number(sourceThresholds[index] ?? fallback));
  thresholds[0] = 0;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (!Number.isFinite(thresholds[index]) || thresholds[index] <= thresholds[index - 1]) {
      thresholds[index] = DEFAULT_GROWTH_THRESHOLDS[index] > thresholds[index - 1]
        ? DEFAULT_GROWTH_THRESHOLDS[index]
        : thresholds[index - 1] + 1;
    }
  }

  return {
    level_thresholds: thresholds,
    online_score_per_minute: Number(overrides.online_score_per_minute ?? 6),
    active_score_per_minute: Number(overrides.active_score_per_minute ?? 14),
    comment_score: Number(overrides.comment_score ?? 180),
    like_score: Number(overrides.like_score ?? 35),
    pro_purchase_bonus: Number(overrides.pro_purchase_bonus ?? 3000),
    max_purchase_bonus: Number(overrides.max_purchase_bonus ?? 9000),
    pro_growth_multiplier_percent: Number(overrides.pro_growth_multiplier_percent ?? 115),
    max_growth_multiplier_percent: Number(overrides.max_growth_multiplier_percent ?? 135)
  };
}

function formatMembershipGrowthMultiplier(percent) {
  const numeric = Number(percent || 100);
  if (!numeric || numeric <= 0) {
    return '1.00x';
  }
  return `${(numeric / 100).toFixed(numeric % 100 === 0 ? 0 : 2)}x`;
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function apiRequest(path, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    throw new Error(payload.message || '请求失败');
  }
  return payload.data;
}

const Card = ({ children, className = '', title, extra }) => (
  <div className={`bg-white rounded-lg border border-[#E5E7EB] shadow-sm ${className}`}>
    {(title || extra) && (
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex justify-between items-center gap-4">
        {title && <h3 className="font-semibold text-[#111827]">{title}</h3>}
        {extra && <div>{extra}</div>}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

const Button = ({ children, variant = 'primary', size = 'md', className = '', icon: Icon, onClick, type = 'button', disabled = false }) => {
  const baseStyle = 'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  const sizeStyle = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-sm';
  const variants = {
    primary: 'bg-[#2563EB] text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-white text-[#374151] border border-[#D1D5DB] hover:bg-gray-50 focus:ring-gray-500',
    danger: 'bg-[#DC2626] text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-[#16A34A] text-white hover:bg-green-700 focus:ring-green-500',
    ghost: 'text-[#6B7280] hover:text-[#111827] hover:bg-gray-100'
  };

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${baseStyle} ${sizeStyle} ${variants[variant]} ${className}`}>
      {Icon && <Icon className={`w-4 h-4 ${children ? 'mr-2' : ''}`} />}
      {children}
    </button>
  );
};

const ActionBar = ({ children }) => (
  <div className="flex justify-end flex-wrap gap-2 max-w-[360px] ml-auto">
    {children}
  </div>
);

const Badge = ({ type, text }) => {
  const styles = {
    success: 'bg-green-100 text-[#16A34A] border-green-200',
    warning: 'bg-yellow-100 text-[#F59E0B] border-yellow-200',
    danger: 'bg-red-100 text-[#DC2626] border-red-200',
    info: 'bg-blue-100 text-[#2563EB] border-blue-200',
    default: 'bg-gray-100 text-[#6B7280] border-gray-200'
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[type] || styles.default}`}>{text}</span>;
};

const Modal = ({ isOpen, title, children, onClose, onConfirm, confirmText = '确认', confirmVariant = 'primary' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex justify-between items-center bg-gray-50">
          <h3 className="font-semibold text-[#111827]">{title}</h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827]"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 text-[#374151]">{children}</div>
        <div className="px-6 py-4 border-t border-[#E5E7EB] bg-gray-50 flex justify-end space-x-3">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmText}</Button>
        </div>
      </div>
    </div>
  );
};

const LoadingState = ({ text = '正在同步数据...' }) => (
  <div className="py-20 flex flex-col items-center justify-center text-[#6B7280]">
    <RefreshCw className="w-6 h-6 animate-spin mb-3" />
    <p className="text-sm">{text}</p>
  </div>
);

const EmptyState = ({ title, desc, image = ILLUSTRATIONS.empty }) => (
  <div className="py-16 flex flex-col items-center justify-center text-center">
    <img src={image} alt={title} className="w-56 h-56 object-contain mb-4" />
    <h3 className="text-lg font-semibold text-[#111827]">{title}</h3>
    <p className="text-sm text-[#6B7280] mt-2 max-w-md">{desc}</p>
  </div>
);

const SectionHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h1 className="text-2xl font-bold text-[#111827]">{title}</h1>
      {subtitle && <p className="text-sm text-[#6B7280] mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

const DataTable = ({ columns, rows, emptyText, emptyImage }) => {
  if (!rows?.length) {
    return <EmptyState title="暂无数据" desc={emptyText || '当前筛选条件下还没有可展示的数据。'} image={emptyImage} />;
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-[#F5F7FA] text-[#6B7280]">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-6 py-3 font-medium border-b border-[#E5E7EB] ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {rows.map((row, index) => (
            <tr key={row.id || `${index}`} className="hover:bg-gray-50 transition-colors">
              {columns.map((column) => (
                <td key={column.key} className={`px-6 py-4 ${column.align === 'right' ? 'text-right' : ''}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DashboardView = ({ data, loading, onRefresh }) => {
  if (loading) return <LoadingState text="正在刷新管理大盘..." />;
  if (!data) return <EmptyState title="总览暂不可用" desc="后台总览接口还没有返回数据。"/>; 

  return (
    <div className="space-y-6">
      <SectionHeader
        title="大盘总览 (Real-time)"
        subtitle="围绕高并发、社区内容和支付转化的统一观测台。"
        actions={[
          <Button key="refresh" variant="secondary" icon={RefreshCw} onClick={onRefresh}>刷新数据</Button>,
          <Button key="export" variant="primary" icon={Download}>导出大盘报告</Button>
        ]}
      />

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-6 items-center">
          <div>
            <h2 className="text-3xl font-bold text-[#111827]">{data.hero?.title}</h2>
            <p className="text-[#6B7280] mt-3">{data.hero?.subtitle}</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E7EB]">
                <div className="text-xs text-[#6B7280]">社区用户</div>
                <div className="mt-2 text-2xl font-bold text-[#111827]">{data.business?.total_users ?? 0}</div>
              </div>
              <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E7EB]">
                <div className="text-xs text-[#6B7280]">圈子总数</div>
                <div className="mt-2 text-2xl font-bold text-[#111827]">{data.business?.total_circles ?? 0}</div>
              </div>
              <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E7EB]">
                <div className="text-xs text-[#6B7280]">累计支付</div>
                <div className="mt-2 text-2xl font-bold text-[#111827]">¥{data.business?.paid_revenue ?? 0}</div>
              </div>
            </div>
          </div>
          <img src={data.hero?.illustration || ILLUSTRATIONS.dashboard} alt="dashboard" className="w-full max-h-72 object-contain" />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {(data.metrics || []).map((metric) => (
          <Card key={metric.title} className="p-4">
            <p className="text-sm text-[#6B7280] font-medium">{metric.title}</p>
            <h4 className="text-2xl font-bold text-[#111827] mt-3">{metric.value}</h4>
            <div className="mt-4">
              <Badge type={metric.status} text={metric.tip || '实时指标'} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="业务概况" className="lg:col-span-2">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[
              { label: '内容总量', value: data.business?.total_posts ?? 0 },
              { label: '反馈工单', value: data.business?.total_feedbacks ?? 0 },
              { label: '提现申请', value: data.business?.total_withdrawals ?? 0 },
              { label: '数据库连接', value: data.devops?.db_total_conns ?? 0 },
              { label: 'Redis 缓存命中', value: `${data.devops?.redis?.hits ?? 0}` },
              { label: '管理员会话', value: '已接通后台 API' }
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
                <div className="text-xs text-[#6B7280]">{item.label}</div>
                <div className="mt-2 text-xl font-semibold text-[#111827]">{item.value}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="上线策略建议">
          <div className="space-y-3 text-sm text-[#374151]">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">消息长连接已经预留独立 WebSocket 服务入口。</div>
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">5 万在线需要多实例 + Redis + 反向代理，不是单机口头保证。</div>
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">当前后台 UI 已接到真实后端接口，可继续扩展审核与运营流程。</div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const UsersView = ({ data, loading, filters, onFilterChange, onSearch, onActionRequest, onRefresh }) => {
  const columns = [
    { key: 'id', title: 'UID', render: (row) => <span className="font-mono text-[#6B7280]">{row.id}</span> },
    {
      key: 'nickname',
      title: '用户信息',
      render: (row) => (
        <div className="flex items-center">
          <img src={row.avatar} alt={row.nickname} className="w-9 h-9 rounded-full object-cover mr-3 border border-[#E5E7EB]" />
          <div>
            <div className="font-medium text-[#111827] flex items-center gap-2">
              {row.nickname}
              <span className="px-1.5 py-0.5 text-[10px] rounded font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">{row.level_label || `LV${row.level_no || 1}`}</span>
              {row.is_vip && <span className={`px-1.5 py-0.5 text-[10px] rounded font-bold ${row.membership_tier === 'max' ? 'bg-[#111827] text-white' : 'bg-yellow-100 text-yellow-800'}`}>{row.membership_tier === 'max' ? 'MAX' : 'PRO'}</span>}
            </div>
            <div className="text-xs text-[#6B7280]">{row.phone}</div>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      title: '状态',
      render: (row) => {
        const mapping = {
          active: { type: 'success', text: '正常' },
          muted: { type: 'warning', text: '禁言中' },
          banned: { type: 'danger', text: '已封禁' }
        };
        const current = mapping[row.status] || { type: 'default', text: row.status };
        return <Badge type={current.type} text={current.text} />;
      }
    },
    {
      key: 'posts',
      title: '业务数据',
      render: (row) => (
        <div className="text-[#6B7280]">
          <div>等级: <span className="text-[#111827] font-medium">{row.level_label || `LV${row.level_no || 1}`}</span></div>
          <div>成长值: <span className="text-[#111827] font-medium">{row.level_score ?? 0}</span></div>
          <div>帖子: <span className="text-[#111827] font-medium">{row.posts}</span></div>
          <div>粉丝: <span className="text-[#111827] font-medium">{row.fans}</span></div>
          <div>会员到期: <span className="text-[#111827] font-medium">{row.membership_expire_text || '未开通'}</span></div>
        </div>
      )
    },
    { key: 'reg_date', title: '注册时间' },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (row) => (
        <ActionBar>
          <Button variant="ghost" size="sm" icon={Eye} onClick={() => onActionRequest({ action: 'view', user: row })}>查看头像</Button>
          {row.status === 'active' && <Button variant="ghost" size="sm" icon={Shield} onClick={() => onActionRequest({ action: 'mute', user: row })}>禁言</Button>}
          {row.status === 'muted' && <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Unlock} onClick={() => onActionRequest({ action: 'unmute', user: row })} />}
          {row.status === 'banned' ? (
            <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Unlock} onClick={() => onActionRequest({ action: 'unban', user: row })}>解封</Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" icon={Lock} onClick={() => onActionRequest({ action: 'ban', user: row })}>封禁</Button>
          )}
          {row.membership_tier !== 'max' && (
            <Button variant="ghost" size="sm" className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-50" icon={Check} onClick={() => onActionRequest({ action: 'grant_vip', user: row })}>{row.membership_tier === 'pro' ? '升级会员' : '赠送会员'}</Button>
          )}
          {row.is_vip ? (
            <Button variant="ghost" size="sm" className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-50" icon={X} onClick={() => onActionRequest({ action: 'revoke_vip', user: row })}>取消会员</Button>
          ) : null}
          {row.status === 'muted' && <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Unlock} onClick={() => onActionRequest({ action: 'unmute', user: row })}>解除禁言</Button>}
        </ActionBar>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="用户管理"
        subtitle="根据真实用户、会员和风控状态做后台管理。"
        actions={[
          <Button key="refresh" variant="secondary" icon={RefreshCw} onClick={onRefresh}>刷新列表</Button>,
          <Button key="export" variant="primary" icon={Download}>导出筛选结果</Button>
        ]}
      />

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">搜索用户</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#9CA3AF]" />
              <input value={filters.keyword} onChange={(e) => onFilterChange('keyword', e.target.value)} placeholder="UID / external_key / 昵称" className="w-full pl-9 pr-3 py-2 border border-[#E5E7EB] rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">账号状态</label>
            <select value={filters.status} onChange={(e) => onFilterChange('status', e.target.value)} className="w-full px-3 py-2 border border-[#E5E7EB] rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">全部状态</option>
              <option value="active">正常活跃</option>
              <option value="muted">已被禁言</option>
              <option value="banned">已被封禁</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1">会员身份</label>
            <select value={filters.vip} onChange={(e) => onFilterChange('vip', e.target.value)} className="w-full px-3 py-2 border border-[#E5E7EB] rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">全部用户</option>
              <option value="vip">全部会员</option>
              <option value="pro">PRO 会员</option>
              <option value="max">MAX 会员</option>
              <option value="normal">普通用户</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="primary" className="flex-1" onClick={onSearch}>查询</Button>
            <Button variant="secondary" onClick={() => onSearch(true)}>重置</Button>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? <LoadingState text="正在加载用户数据..." /> : <DataTable columns={columns} rows={data?.data || []} emptyText="用户列表还没有返回数据。" emptyImage={ILLUSTRATIONS.users} />}
        {data && (
          <div className="px-6 py-4 border-t border-[#E5E7EB] flex justify-between items-center bg-white text-sm text-[#6B7280]">
            <span>当前页 {data.current_page || 1} / 共 {data.total || 0} 条用户记录</span>
            <span>用户管理动作已接到真实后台。</span>
          </div>
        )}
      </Card>
    </div>
  );
};

const SimpleTableView = ({ title, subtitle, data, loading, columns, image, emptyText, extra }) => (
  <div className="space-y-4">
    <SectionHeader title={title} subtitle={subtitle} actions={extra} />
    <Card className="p-0 overflow-hidden">
      {loading ? <LoadingState /> : <DataTable columns={columns} rows={Array.isArray(data) ? data : data?.data || data?.threads || data?.withdrawals || []} emptyText={emptyText} emptyImage={image} />}
    </Card>
  </div>
);

const RevenueView = ({ data, loading }) => {
  if (loading) return <LoadingState text="正在同步收益与提现..." />;
  if (!data) return <EmptyState title="收益数据暂不可用" desc="收益中心接口还没有返回数据。" image={ILLUSTRATIONS.revenue} />;

  const columns = [
    { key: 'user_name', title: '申请用户' },
    { key: 'price', title: '提现金额', render: (row) => `¥${row.price}` },
    { key: 'bank_name', title: '银行' },
    { key: 'bank_card', title: '卡号' },
    { key: 'status_value', title: '状态', render: (row) => <Badge type={row.status_value.includes('处理') ? 'warning' : 'success'} text={row.status_value} /> },
    { key: 'created_at', title: '申请时间' }
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title="收益与提现" subtitle="支付结果、内容打赏和提现申请汇总。" />
      <Card>
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: '累计支付', value: `¥${data.summary?.total_paid || 0}` },
              { title: '打赏收入', value: `¥${data.summary?.reward_paid || 0}` },
              { title: '提现总额', value: `¥${data.summary?.withdraw_amount || 0}` },
              { title: '提现笔数', value: data.summary?.withdraw_count || 0 }
            ].map((item) => (
              <div key={item.title} className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
                <div className="text-xs text-[#6B7280]">{item.title}</div>
                <div className="mt-2 text-2xl font-semibold text-[#111827]">{item.value}</div>
              </div>
            ))}
          </div>
          <img src={data.summary?.illustration || ILLUSTRATIONS.revenue} alt="revenue" className="w-full max-h-72 object-contain" />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden" title="提现申请列表">
        <DataTable columns={columns} rows={data.withdrawals || []} emptyText="还没有提现申请记录。" image={ILLUSTRATIONS.revenue} />
      </Card>
    </div>
  );
};

const RiskView = ({ data, loading, keywordsDraft, onKeywordsChange, onSaveKeywords, savingKeywords, onRefresh }) => {
  if (loading) return <LoadingState text="正在读取风控配置..." />;
  if (!data) return <EmptyState title="风控中心暂不可用" desc="风控接口还没有返回数据。" image={ILLUSTRATIONS.users} />;

  const columns = [
    { key: 'id', title: 'UID' },
    {
      key: 'nickname',
      title: '账号',
      render: (row) => (
        <div className="flex items-center">
          <img src={row.avatar} alt={row.nickname} className="w-9 h-9 rounded-full object-cover mr-3 border border-[#E5E7EB]" />
          <div>
            <div className="font-medium text-[#111827]">{row.nickname}</div>
            <div className="text-xs text-[#6B7280]">{row.phone}</div>
          </div>
        </div>
      )
    },
    { key: 'ban_reason', title: '封禁原因', render: (row) => <div className="max-w-[360px] whitespace-normal text-[#374151]">{row.ban_reason || '未填写'}</div> },
    { key: 'banned_at', title: '封禁时间' },
    { key: 'posts', title: '帖子数' }
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="举报与风控"
        subtitle="维护平台违禁词，查看当前封禁中的高风险账号。"
        actions={<Button variant="secondary" icon={RefreshCw} onClick={onRefresh}>刷新风控数据</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: '封禁账号', value: data.summary?.banned_users || 0 },
          { title: '违禁词数量', value: data.summary?.keyword_count || 0 },
          { title: '自动审核状态', value: '已启用' }
        ].map((item) => (
          <Card key={item.title} className="p-4">
            <div className="text-xs text-[#6B7280]">{item.title}</div>
            <div className="mt-2 text-2xl font-semibold text-[#111827]">{item.value}</div>
          </Card>
        ))}
      </div>

      <Card
        title="违禁词配置"
        extra={<Button variant="primary" onClick={onSaveKeywords} disabled={savingKeywords}>{savingKeywords ? '保存中...' : '保存风控词'}</Button>}
      >
        <textarea
          value={keywordsDraft}
          onChange={(e) => onKeywordsChange(e.target.value)}
          rows={10}
          className="w-full border border-[#E5E7EB] rounded p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="每行一个违禁词，保存后会立即参与发帖、评论、建圈审核。"
        />
        <div className="mt-3 text-xs text-[#6B7280]">
          当前命中后的行为是自动下架并给发布者发送系统通知。
        </div>
      </Card>

      <Card className="p-0 overflow-hidden" title="封禁账号列表">
        <DataTable columns={columns} rows={data.banned_users || []} emptyText="当前没有被封禁的账号。" emptyImage={ILLUSTRATIONS.users} />
      </Card>
    </div>
  );
};

const MessagesView = ({ data, loading, keyword, onKeywordChange, onSearch, onRefresh, threadData, threadLoading, onSelectThread, replyText, onReplyChange, onReplySend, replySending, replyError }) => {
  if (loading) return <LoadingState text="正在同步消息中心..." />;
  if (!data) return <EmptyState title="消息中心暂不可用" desc="消息统计接口还没有返回数据。" image={ILLUSTRATIONS.messages} />;

  const selectedUserID = threadData?.user?.id;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="消息与客服"
        subtitle="按账号检索客服会话，实时查看和回复用户消息。"
        actions={<Button variant="secondary" icon={RefreshCw} onClick={onRefresh}>刷新消息中心</Button>}
      />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: '实时在线', value: data.summary?.online_users || 0 },
          { title: '消息总量', value: data.summary?.chat_count || 0 },
          { title: '客服会话', value: data.summary?.thread_count || 0 },
          { title: '未读私聊', value: data.summary?.unread_chat_count || 0 },
          { title: '未读通知', value: data.summary?.unread_notice_count || 0 }
        ].map((item) => (
          <Card key={item.title} className="p-4">
            <div className="text-xs text-[#6B7280]">{item.title}</div>
            <div className="mt-2 text-2xl font-semibold text-[#111827]">{item.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[0.92fr_1.08fr] gap-6">
        <Card
          title="客服会话池"
          extra={(
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#9CA3AF]" />
                <input
                  value={keyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSearch();
                  }}
                  placeholder="按昵称或账号查找"
                  className="w-48 pl-9 pr-3 py-2 border border-[#E5E7EB] rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={onSearch}>查询</Button>
            </div>
          )}
        >
          {!data.threads?.length ? (
            <EmptyState title="暂无客服会话" desc="用户一旦进入官方客服聊天，这里就会开始沉淀会话记录。" image={ILLUSTRATIONS.messages} />
          ) : (
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1 custom-scrollbar">
              {data.threads.map((thread) => (
                <button
                  key={thread.user_id}
                  type="button"
                  onClick={() => onSelectThread(thread.user_id)}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${selectedUserID === thread.user_id ? 'border-blue-300 bg-blue-50' : 'border-[#E5E7EB] hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-3">
                    <img src={thread.user_avatar} alt={thread.user_name} className="w-10 h-10 rounded-full object-cover border border-[#E5E7EB]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-[#111827] truncate">{thread.user_name}</div>
                        <div className="text-xs text-[#6B7280] whitespace-nowrap">{thread.created_at}</div>
                      </div>
                      <div className="mt-1 text-xs text-[#6B7280] truncate">{thread.account || '未绑定账号'}</div>
                      <div className="mt-1 text-sm text-[#374151] truncate">{thread.chat_content || '[图片消息]'}</div>
                    </div>
                    {thread.unread_count > 0 && <Badge type="danger" text={`${thread.unread_count} 条未读`} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title={threadData?.user ? `正在接待：${threadData.user.user_name}` : '聊天详情'}>
          {threadLoading ? (
            <LoadingState text="正在加载聊天记录..." />
          ) : !threadData?.user ? (
            <EmptyState title="请选择左侧会话" desc="选中一个账号后，这里会展示完整聊天记录并支持直接回复。" image={ILLUSTRATIONS.messages} />
          ) : (
            <>
              <div className="max-h-[520px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {(threadData.messages || []).length ? (
                  threadData.messages.map((message) => {
                    const isService = Number(message.sender_id) === Number(threadData.service_user?.id || 0);
                    return (
                      <div key={message.id} className={`flex ${isService ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-lg px-4 py-3 border ${isService ? 'bg-blue-600 text-white border-blue-600' : 'bg-[#F9FAFB] text-[#111827] border-[#E5E7EB]'}`}>
                          <div className={`text-xs mb-1 ${isService ? 'text-blue-100' : 'text-[#6B7280]'}`}>
                            {isService ? threadData.service_user?.user_name : threadData.user?.user_name} · {message.datetime}
                          </div>
                          <div className="text-sm whitespace-pre-wrap break-words">{message.chat_content || '[图片消息]'}</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState title="还没有聊天记录" desc="可以直接在下方以官方客服身份回复，首次消息会从这里开始沉淀。" image={ILLUSTRATIONS.messages} />
                )}
              </div>

              <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                <label className="block text-sm font-medium text-[#374151] mb-2">客服回复</label>
                <textarea
                  value={replyText}
                  onChange={(e) => onReplyChange(e.target.value)}
                  rows={4}
                  className="w-full border border-[#E5E7EB] rounded p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="在这里输入要发给用户的客服回复。"
                />
                {replyError && <div className="mt-2 text-sm text-red-600">{replyError}</div>}
                <div className="mt-3 flex justify-end">
                  <Button variant="primary" onClick={onReplySend} disabled={replySending || !replyText.trim()}>
                    {replySending ? '发送中...' : '发送回复'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

const SystemView = ({
  data,
  loading,
  membershipPlansDraft,
  growthRulesDraft,
  onMembershipPlanChange,
  onGrowthRuleChange,
  onGrowthThresholdChange,
  onSaveMembershipPlans,
  onSaveGrowthRules,
  savingMembershipPlans,
  savingGrowthRules,
  onRefresh
}) => {
  if (loading) return <LoadingState text="正在读取系统配置..." />;
  if (!data) return <EmptyState title="系统配置暂不可用" desc="系统配置接口还没有返回数据。" image={ILLUSTRATIONS.system} />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="系统配置"
        subtitle="当前后台读到的应用配置、运营素材与会员方案配置。"
        actions={[
          <Button key="refresh" variant="secondary" icon={RefreshCw} onClick={onRefresh}>刷新配置</Button>,
          <Button key="save" variant="primary" onClick={onSaveMembershipPlans} disabled={savingMembershipPlans}>{savingMembershipPlans ? '保存中...' : '保存会员配置'}</Button>
        ]}
      />
      <Card>
        <div className="grid lg:grid-cols-[1fr_0.8fr] gap-6 items-center">
          <div className="space-y-4">
            {[
              ['应用名称', data.app?.name],
              ['基础域名', data.app?.public_base_url],
              ['默认支付', data.app?.default_pay],
              ['Pro 价格', `¥${data.app?.membership_price_pro || data.app?.membership_price || 0}`],
              ['Max 价格', `¥${data.app?.membership_price_max || 0}`],
              ['Pro 时长', `${data.app?.membership_duration_days_pro || 30} 天`],
              ['Max 时长', `${data.app?.membership_duration_days_max || 30} 天`],
              ['评论成长值', `+${growthRulesDraft?.comment_score || 180}`],
              ['点赞成长值', `+${growthRulesDraft?.like_score || 35}`],
              ['Pro 成长倍率', formatMembershipGrowthMultiplier(growthRulesDraft?.pro_growth_multiplier_percent || 115)],
              ['Max 成长倍率', formatMembershipGrowthMultiplier(growthRulesDraft?.max_growth_multiplier_percent || 135)],
              ['全局缓存 TTL', data.app?.cache_ttl],
              ['用户缓存 TTL', data.app?.user_cache_ttl],
              ['当前管理员', data.admin_user]
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between p-3 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
                <span className="text-sm text-[#6B7280]">{label}</span>
                <span className="text-sm font-medium text-[#111827]">{value}</span>
              </div>
            ))}
          </div>
          <img src={data.assets?.about_logo || ILLUSTRATIONS.system} alt="system" className="w-full max-h-72 object-contain" />
        </div>
      </Card>

      <Card
        title="等级成长规则配置"
        extra={<Button variant="primary" onClick={onSaveGrowthRules} disabled={savingGrowthRules}>{savingGrowthRules ? '保存中...' : '保存等级规则'}</Button>}
      >
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              ['online_score_per_minute', '在线每分钟'],
              ['active_score_per_minute', '活跃每分钟'],
              ['comment_score', '发评论'],
              ['like_score', '点赞'],
              ['pro_purchase_bonus', 'Pro 开通奖励'],
              ['max_purchase_bonus', 'Max 开通奖励']
            ].map(([key, label]) => (
              <label key={key} className="block text-sm text-[#374151]">
                <div className="mb-2 font-medium">{label}</div>
                <input
                  type="number"
                  min="0"
                  value={growthRulesDraft?.[key] ?? 0}
                  onChange={(e) => onGrowthRuleChange(key, Number(e.target.value || 0))}
                  className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block text-sm text-[#374151]">
              <div className="mb-2 font-medium">Pro 成长倍率百分比</div>
              <input
                type="number"
                min="100"
                value={growthRulesDraft?.pro_growth_multiplier_percent ?? 115}
                onChange={(e) => onGrowthRuleChange('pro_growth_multiplier_percent', Number(e.target.value || 100))}
                className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block text-sm text-[#374151]">
              <div className="mb-2 font-medium">Max 成长倍率百分比</div>
              <input
                type="number"
                min="100"
                value={growthRulesDraft?.max_growth_multiplier_percent ?? 135}
                onChange={(e) => onGrowthRuleChange('max_growth_multiplier_percent', Number(e.target.value || 100))}
                className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div>
            <div className="mb-3 text-sm font-medium text-[#374151]">LV1-LV10 门槛成长值</div>
            <div className="grid md:grid-cols-3 xl:grid-cols-10 gap-3">
              {(growthRulesDraft?.level_thresholds || DEFAULT_GROWTH_THRESHOLDS).map((score, index) => (
                <label key={`level-${index + 1}`} className="block text-sm text-[#374151]">
                  <div className="mb-2 text-xs text-[#6B7280]">LV{index + 1}</div>
                  <input
                    type="number"
                    min="0"
                    disabled={index === 0}
                    value={score}
                    onChange={(e) => onGrowthThresholdChange(index, Number(e.target.value || 0))}
                    className={`w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${index === 0 ? 'bg-gray-100 text-[#6B7280]' : ''}`}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="会员方案配置">
        <div className="space-y-4">
          {(membershipPlansDraft || []).map((plan, index) => (
            <div key={plan.code || index} className="rounded-lg border border-[#E5E7EB] p-5 bg-[#F9FAFB]">
              <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <label className="block text-sm text-[#374151]">
                      <div className="mb-2 font-medium">方案编码</div>
                      <input value={plan.code || ''} disabled className="w-full border border-[#E5E7EB] rounded p-3 text-sm bg-gray-100 text-[#6B7280]" />
                    </label>
                    <label className="block text-sm text-[#374151]">
                      <div className="mb-2 font-medium">方案名称</div>
                      <input value={plan.name || ''} onChange={(e) => onMembershipPlanChange(index, 'name', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </label>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <label className="block text-sm text-[#374151]">
                      <div className="mb-2 font-medium">徽标文案</div>
                      <input value={plan.badge_text || ''} onChange={(e) => onMembershipPlanChange(index, 'badge_text', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </label>
                    <label className="block text-sm text-[#374151]">
                      <div className="mb-2 font-medium">价格</div>
                      <input type="number" min="0" step="0.01" value={plan.price ?? 0} onChange={(e) => onMembershipPlanChange(index, 'price', Number(e.target.value || 0))} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </label>
                    <label className="flex items-center gap-3 text-sm text-[#374151] pt-8">
                      <input type="checkbox" checked={!!plan.enabled} onChange={(e) => onMembershipPlanChange(index, 'enabled', e.target.checked)} className="w-4 h-4" />
                      启用方案
                    </label>
                  </div>

                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">有效天数</div>
                    <input type="number" min="1" value={plan.duration_days ?? 30} onChange={(e) => onMembershipPlanChange(index, 'duration_days', Number(e.target.value || 0))} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>

                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">短介绍</div>
                    <input value={plan.tagline || ''} onChange={(e) => onMembershipPlanChange(index, 'tagline', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>

                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">方案描述</div>
                    <textarea value={plan.description || ''} onChange={(e) => onMembershipPlanChange(index, 'description', e.target.value)} rows={3} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>

                  <div className="grid md:grid-cols-2 gap-4">
                    <label className="block text-sm text-[#374151]">
                      <div className="mb-2 font-medium">按钮文案</div>
                      <input value={plan.button_text || ''} onChange={(e) => onMembershipPlanChange(index, 'button_text', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </label>
                    <label className="block text-sm text-[#374151]">
                      <div className="mb-2 font-medium">排序</div>
                      <input type="number" min="0" value={plan.sort_order ?? 0} onChange={(e) => onMembershipPlanChange(index, 'sort_order', Number(e.target.value || 0))} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </label>
                  </div>

                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">权益说明</div>
                    <textarea value={(plan.benefits || []).join('\n')} onChange={(e) => onMembershipPlanChange(index, 'benefits', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} rows={5} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="mt-2 text-xs text-[#6B7280]">一行一条权益，小程序会员页会按这个顺序展示。</div>
                  </label>
                </div>

                <div className="space-y-4">
                  <div className="text-sm font-medium text-[#374151]">会员页预览</div>
                  <div className={`rounded-2xl border p-5 ${plan.code === 'max' ? 'border-amber-200 bg-amber-50' : 'border-[#E5E7EB] bg-white'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold text-[#111827]">{plan.name || '会员方案'}</div>
                        <div className="mt-2 text-sm text-[#6B7280]">{plan.tagline || '这里会展示方案的短介绍。'}</div>
                      </div>
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold ${plan.code === 'max' ? 'bg-[#111827] text-white' : 'bg-blue-100 text-blue-700'}`}>{plan.badge_text || 'VIP'}</span>
                    </div>
                    <div className="mt-4 text-3xl font-bold text-[#111827]">¥{Number(plan.price || 0).toFixed(1)}<span className="ml-2 text-base font-medium text-[#6B7280]">/ {Number(plan.duration_days || 30)} 天</span></div>
                    <div className="mt-4 text-sm text-[#374151]">{plan.description || '这里会展示更详细的方案说明。'}</div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-[#E5E7EB] bg-white/80 px-3 py-2">
                        <div className="text-[11px] text-[#6B7280]">有效期</div>
                        <div className="mt-1 text-sm font-semibold text-[#111827]">{Number(plan.duration_days || 30)} 天</div>
                      </div>
                      <div className="rounded-lg border border-[#E5E7EB] bg-white/80 px-3 py-2">
                        <div className="text-[11px] text-[#6B7280]">开通奖励</div>
                        <div className="mt-1 text-sm font-semibold text-[#111827]">+{Number(plan.growth_bonus_score || 0)}</div>
                      </div>
                      <div className="rounded-lg border border-[#E5E7EB] bg-white/80 px-3 py-2">
                        <div className="text-[11px] text-[#6B7280]">成长倍率</div>
                        <div className="mt-1 text-sm font-semibold text-[#111827]">{formatMembershipGrowthMultiplier(plan.growth_multiplier_percent)}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-[#6B7280]">所有会员均为限时权益，到期自动失效。</div>
                    <div className="mt-4 space-y-2">
                      {(plan.benefits || []).map((benefit, benefitIndex) => (
                        <div key={`${plan.code}-${benefitIndex}`} className="flex items-start gap-2 text-sm text-[#374151]">
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-[#2563EB] flex-shrink-0"></span>
                          <span>{benefit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const OperationsView = ({ data, loading, adsDraft, onAdsChange, onAddAd, onRemoveAd, onSaveAds, savingAds, onRefresh }) => {
  if (loading) return <LoadingState text="正在读取运营配置..." />;
  if (!data) return <EmptyState title="广告配置暂不可用" desc="广告管理接口还没有返回数据。" image={ILLUSTRATIONS.system} />;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="广告管理"
        subtitle="这里管理的是你自己的广告位，不是微信流量主广告。可配置图片、文案和跳转链接。"
        actions={[
          <Button key="refresh" variant="secondary" icon={RefreshCw} onClick={onRefresh}>刷新配置</Button>,
          <Button key="add" variant="secondary" onClick={onAddAd}>新增广告</Button>,
          <Button key="save" variant="primary" onClick={onSaveAds} disabled={savingAds}>{savingAds ? '保存中...' : '保存广告配置'}</Button>
        ]}
      />

      <Card title="投放说明">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm text-[#374151]">
          {AD_SLOT_OPTIONS.map((slot) => (
            <div key={slot.value} className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="font-semibold text-[#111827]">{slot.label}</div>
              <div className="mt-2 text-xs text-[#6B7280] font-mono">{slot.value}</div>
              <div className="mt-2">{slot.desc}</div>
            </div>
          ))}
          <div className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="font-semibold text-[#111827]">小程序页面链接</div>
            <div className="mt-2 text-xs text-[#6B7280] font-mono">path</div>
            <div className="mt-2">例如 `/pages/mine/members/members`，用于活动页、会员页和专题页。</div>
          </div>
          <div className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="font-semibold text-[#111827]">H5 跳转链接</div>
            <div className="mt-2 text-xs text-[#6B7280] font-mono">webview</div>
            <div className="mt-2">外部链接必须是 HTTPS，并且已经加入小程序业务域名白名单。</div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {(adsDraft || []).map((ad, index) => (
          <Card
            key={ad.id || index}
            title={`广告 ${index + 1}`}
            extra={<Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onRemoveAd(index)}>删除</Button>}
          >
            <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">广告ID</div>
                    <input value={ad.id || ''} onChange={(e) => onAdsChange(index, 'id', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">广告位 Slot</div>
                    <select value={ad.slot || 'feed_stream'} onChange={(e) => onAdsChange(index, 'slot', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      {AD_SLOT_OPTIONS.map((slot) => (
                        <option key={slot.value} value={slot.value}>{slot.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">主标题</div>
                    <input value={ad.title || ''} onChange={(e) => onAdsChange(index, 'title', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">按钮文案</div>
                    <input value={ad.button_text || ''} onChange={(e) => onAdsChange(index, 'button_text', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                </div>

                <label className="block text-sm text-[#374151]">
                  <div className="mb-2 font-medium">副标题</div>
                  <textarea value={ad.subtitle || ''} onChange={(e) => onAdsChange(index, 'subtitle', e.target.value)} rows={3} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </label>

                <label className="block text-sm text-[#374151]">
                  <div className="mb-2 font-medium">图片地址</div>
                  <input value={ad.image_url || ''} onChange={(e) => onAdsChange(index, 'image_url', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder={`${API_BASE}/assets/illustrations/plain-credit-card-cuate.png`} />
                </label>

                <div className="grid md:grid-cols-3 gap-4">
                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">跳转类型</div>
                    <select value={ad.action_type || 'path'} onChange={(e) => onAdsChange(index, 'action_type', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="path">小程序链接</option>
                      <option value="webview">网页链接</option>
                      <option value="none">不跳转</option>
                    </select>
                  </label>
                  <label className="block text-sm text-[#374151]">
                    <div className="mb-2 font-medium">排序</div>
                    <input type="number" value={ad.sort_order ?? 10} onChange={(e) => onAdsChange(index, 'sort_order', Number(e.target.value || 0))} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex items-center gap-3 text-sm text-[#374151] pt-8">
                    <input type="checkbox" checked={!!ad.enabled} onChange={(e) => onAdsChange(index, 'enabled', e.target.checked)} className="w-4 h-4" />
                    启用投放
                  </label>
                </div>

                <label className="block text-sm text-[#374151]">
                  <div className="mb-2 font-medium">跳转链接</div>
                  <input value={ad.action_value || ''} onChange={(e) => onAdsChange(index, 'action_value', e.target.value)} className="w-full border border-[#E5E7EB] rounded p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://your-domain.com/activity 或 /pages/mine/members/members" />
                  <div className="mt-2 text-xs text-[#6B7280]">这里直接填链接即可：外部活动页填 `https://...`，小程序页面填 `/pages/...`。</div>
                </label>
              </div>

              <div className="space-y-4">
                <div className="text-sm font-medium text-[#374151]">预览效果</div>
                <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <div className="flex gap-4">
                    <div className="w-24 h-24 rounded-2xl bg-[#E5E7EB] overflow-hidden flex-shrink-0">
                      {ad.image_url ? <img src={ad.image_url} alt={ad.title || 'ad'} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-[#111827] text-white text-xs">推广</span>
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-[#2563EB] text-white text-xs">{ad.button_text || '立即查看'}</span>
                      </div>
                      <div className="mt-3 text-base font-semibold text-[#111827]">{ad.title || '请填写广告标题'}</div>
                      <div className="mt-2 text-sm text-[#6B7280]">{ad.subtitle || '这里会显示广告副标题与利益点。'}</div>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-[#1D4ED8]">
                  当前启用状态：{ad.enabled ? '启用中' : '已关闭'}，广告位：{AD_SLOT_OPTIONS.find((slot) => slot.value === ad.slot)?.label || ad.slot || '未选择'}，跳转方式：{ad.action_type || 'path'}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const DevOpsView = ({ data, loading }) => {
  if (loading) return <LoadingState text="正在读取高可用监控..." />;
  if (!data) return <EmptyState title="监控中心暂不可用" desc="高可用监控接口还没有返回数据。" image={ILLUSTRATIONS.dashboard} />;

  return (
    <div className="space-y-6">
      <SectionHeader title="高可用与系统监控" subtitle="数据库、Redis、审核队列与 WebSocket 在线心跳。" actions={<Button variant="secondary" icon={RefreshCw}>自动刷新 (5s)</Button>} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="PostgreSQL 连接池" className="lg:col-span-1">
          <div className="space-y-3 text-sm text-[#374151]">
            <div className="flex justify-between"><span className="text-[#6B7280]">总连接</span><strong>{data.db?.total_conns ?? 0}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">活跃连接</span><strong>{data.db?.acquired_conns ?? 0}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">空闲连接</span><strong>{data.db?.idle_conns ?? 0}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">上限</span><strong>{data.db?.max_conns ?? 0}</strong></div>
          </div>
        </Card>
        <Card title="Redis 缓存池" className="lg:col-span-1">
          <div className="space-y-3 text-sm text-[#374151]">
            <div className="flex justify-between"><span className="text-[#6B7280]">启用状态</span><strong>{data.redis?.enabled ? '已启用' : '未启用'}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">Hits</span><strong>{data.redis?.hits ?? 0}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">Misses</span><strong>{data.redis?.misses ?? 0}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">Timeouts</span><strong>{data.redis?.timeouts ?? 0}</strong></div>
          </div>
        </Card>
        <Card title="实时连接层" className="lg:col-span-1">
          <div className="space-y-3 text-sm text-[#374151]">
            <div className="flex justify-between"><span className="text-[#6B7280]">在线用户</span><strong>{data.realtime?.online_users ?? 0}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">Presence Key</span><strong className="font-mono text-xs">{data.realtime?.presence_key}</strong></div>
            <div className="flex justify-between"><span className="text-[#6B7280]">目标水位</span><strong>{data.realtime?.target_online ?? 0}</strong></div>
          </div>
        </Card>
      </div>

      <Card title="异步任务与审核积压">
        <div className="space-y-4">
          {(data.queues || []).map((queue) => (
            <div key={queue.name} className="p-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-mono text-sm font-semibold text-[#111827]">{queue.name}</div>
                <div className="text-xs text-[#6B7280] mt-1">当前积压：{queue.backlog}</div>
              </div>
              <Badge type={queue.status} text={queue.status === 'danger' ? '高风险' : queue.status === 'warning' ? '需要关注' : '健康'} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const AuthView = ({ adminUser }) => (
  <div className="space-y-6">
    <SectionHeader title="权限管理" subtitle="后台管理员角色现在走单一管理员令牌，后续可以再扩展 RBAC。" />
    <Card>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
          <div className="text-xs text-[#6B7280]">当前管理员</div>
          <div className="mt-2 text-xl font-semibold text-[#111827]">{adminUser || 'admin'}</div>
        </div>
        <div className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
          <div className="text-xs text-[#6B7280]">登录策略</div>
          <div className="mt-2 text-xl font-semibold text-[#111827]">JWT + 后端校验</div>
        </div>
        <div className="p-4 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
          <div className="text-xs text-[#6B7280]">下一步建议</div>
          <div className="mt-2 text-xl font-semibold text-[#111827]">扩展 RBAC</div>
        </div>
      </div>
    </Card>
  </div>
);

export default function App() {
  const [session, setSession] = useState(loadStoredSession());
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'InfiniLink@2026' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [viewData, setViewData] = useState({});
  const [viewLoading, setViewLoading] = useState({});
  const [userFilters, setUserFilters] = useState({ keyword: '', status: '', vip: '' });
  const [messageFilters, setMessageFilters] = useState({ keyword: '' });
  const [pendingAction, setPendingAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionDurationHours, setActionDurationHours] = useState(168);
  const [actionMembershipTier, setActionMembershipTier] = useState('pro');
  const [riskKeywordsDraft, setRiskKeywordsDraft] = useState('');
  const [isSavingRiskKeywords, setIsSavingRiskKeywords] = useState(false);
  const [operationAdsDraft, setOperationAdsDraft] = useState([]);
  const [isSavingOperationAds, setIsSavingOperationAds] = useState(false);
  const [membershipPlansDraft, setMembershipPlansDraft] = useState([]);
  const [isSavingMembershipPlans, setIsSavingMembershipPlans] = useState(false);
  const [growthRulesDraft, setGrowthRulesDraft] = useState(createGrowthRulesDraft());
  const [isSavingGrowthRules, setIsSavingGrowthRules] = useState(false);
  const [messageThread, setMessageThread] = useState(null);
  const [messageThreadLoading, setMessageThreadLoading] = useState(false);
  const [messageReply, setMessageReply] = useState('');
  const [messageReplyError, setMessageReplyError] = useState('');
  const [isSendingMessageReply, setIsSendingMessageReply] = useState(false);

  const currentLabel = useMemo(() => NAVIGATION.flatMap((group) => group.items).find((item) => item.id === currentView)?.label || currentView, [currentView]);

  const viewPath = useCallback((viewId, opts = {}) => {
    if (viewId === 'users') {
      const params = new URLSearchParams();
      const filters = opts.filters || userFilters;
      if (filters.keyword) params.set('keyword', filters.keyword);
      if (filters.status) params.set('status', filters.status);
      if (filters.vip) params.set('vip', filters.vip);
      return `/api/admin/v1/users${params.toString() ? `?${params.toString()}` : ''}`;
    }
    if (viewId === 'risk') return '/api/admin/v1/risk';
    if (viewId === 'verification') return '/api/admin/v1/authentications';
    if (viewId === 'content') return '/api/admin/v1/posts';
    if (viewId === 'circles') return '/api/admin/v1/circles';
    if (viewId === 'messages') {
      const params = new URLSearchParams();
      const keyword = typeof opts.keyword === 'string' ? opts.keyword : messageFilters.keyword;
      if (keyword) params.set('keyword', keyword);
      return `/api/admin/v1/messages${params.toString() ? `?${params.toString()}` : ''}`;
    }
    if (viewId === 'tickets') return '/api/admin/v1/feedbacks';
    if (viewId === 'orders') return '/api/admin/v1/orders';
    if (viewId === 'revenue') return '/api/admin/v1/revenue';
    if (viewId === 'ads' || viewId === 'ops' || viewId === 'sys' || viewId === 'auth') return '/api/admin/v1/system';
    return '/api/admin/v1/devops';
  }, [messageFilters.keyword, userFilters]);

  const loadView = useCallback(async (viewId, opts = {}) => {
    if (!session?.token) return;
    setViewLoading((prev) => ({ ...prev, [viewId]: true }));
    try {
      const data = await apiRequest(viewPath(viewId, opts), {}, session.token);
      setViewData((prev) => ({ ...prev, [viewId]: data }));
      if (viewId === 'risk') {
        setRiskKeywordsDraft((data?.sensitive_words || []).join('\n'));
      }
      if (viewId === 'ads' || viewId === 'ops' || viewId === 'sys') {
        setOperationAdsDraft((data?.operation_ads || []).map((item) => createOperationAdDraft(item)));
        setMembershipPlansDraft((data?.membership_plans || []).map((item) => createMembershipPlanDraft(item)));
        setGrowthRulesDraft(createGrowthRulesDraft(data?.growth_rules || {}));
      }
    } catch (err) {
      if (String(err.message).includes('管理员')) {
        setSession(null);
        saveSession(null);
      }
      setViewData((prev) => ({ ...prev, [viewId]: null }));
    } finally {
      setViewLoading((prev) => ({ ...prev, [viewId]: false }));
    }
  }, [session, viewPath]);

  useEffect(() => {
    if (!session?.token) return;
    loadView(currentView);
    if (currentView !== 'dashboard' && !viewData.dashboard) {
      loadView('dashboard');
    }
  }, [session, currentView, loadView]);

  const loadMessageThread = useCallback(async (userID) => {
    if (!session?.token || !userID) return;
    setMessageThreadLoading(true);
    setMessageReplyError('');
    try {
      const data = await apiRequest(`/api/admin/v1/messages/${userID}`, {}, session.token);
      setMessageThread(data);
    } catch (err) {
      setMessageThread(null);
      setMessageReplyError(err.message || '加载聊天记录失败');
    } finally {
      setMessageThreadLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (currentView !== 'messages') return;
    const threads = viewData.messages?.threads || [];
    if (!threads.length) {
      setMessageThread(null);
      return;
    }
    const selectedExists = messageThread?.user?.id && threads.some((thread) => thread.user_id === messageThread.user.id);
    if (!selectedExists) {
      loadMessageThread(threads[0].user_id);
    }
  }, [currentView, viewData.messages, messageThread?.user?.id, loadMessageThread]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const data = await apiRequest('/api/admin/v1/login', {
        method: 'POST',
        body: JSON.stringify(loginForm)
      });
      const nextSession = { token: data.token, username: data.username };
      setSession(nextSession);
      saveSession(nextSession);
      setCurrentView('dashboard');
    } catch (err) {
      setLoginError(err.message || '登录失败');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    saveSession(null);
    setViewData({});
  };

  const closeActionModal = () => {
    setPendingAction(null);
    setActionReason('');
    setActionError('');
    setActionDurationHours(168);
    setActionMembershipTier('pro');
  };

  const queueAction = (config) => {
    setPendingAction(config);
    setActionReason(config.defaultReason || '');
    setActionError('');
    setActionDurationHours(config.defaultDurationHours || 168);
    setActionMembershipTier(config.defaultMembershipTier || 'pro');
  };

  const handlePendingAction = async () => {
    if (!pendingAction || !session?.token) return;
    try {
      setActionError('');
      const payload = {
        action: pendingAction.action,
        reason: actionReason
      };
      if (pendingAction.requiresDuration) {
        payload.duration_hours = Number(actionDurationHours) || 168;
      }
      if (pendingAction.requiresMembershipTier) {
        payload.membership_tier = actionMembershipTier || 'pro';
      }

      await apiRequest(pendingAction.endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      }, session.token);
      const reloadViews = Array.from(new Set([...(pendingAction.reloadViews || [currentView]), 'dashboard']));
      closeActionModal();
      await Promise.all(reloadViews.map((viewId) => loadView(viewId, { force: true })));
    } catch (err) {
      setActionError(err.message || '操作失败');
    }
  };

  const handleSaveRiskKeywords = async () => {
    if (!session?.token) return;
    setIsSavingRiskKeywords(true);
    try {
      await apiRequest('/api/admin/v1/risk/keywords', {
        method: 'POST',
        body: JSON.stringify({ text: riskKeywordsDraft })
      }, session.token);
      await loadView('risk', { force: true });
    } finally {
      setIsSavingRiskKeywords(false);
    }
  };

  const handleSaveOperationAds = async () => {
    if (!session?.token) return;
    setIsSavingOperationAds(true);
    try {
      await apiRequest('/api/admin/v1/system/ads', {
        method: 'POST',
        body: JSON.stringify({ ads: operationAdsDraft })
      }, session.token);
      await Promise.all([
        loadView('ads', { force: true }),
        loadView('sys', { force: true })
      ]);
    } finally {
      setIsSavingOperationAds(false);
    }
  };

  const handleSaveMembershipPlans = async () => {
    if (!session?.token) return;
    setIsSavingMembershipPlans(true);
    try {
      await apiRequest('/api/admin/v1/system/membership', {
        method: 'POST',
        body: JSON.stringify({ plans: membershipPlansDraft })
      }, session.token);
      await loadView('sys', { force: true });
    } finally {
      setIsSavingMembershipPlans(false);
    }
  };

  const handleSaveGrowthRules = async () => {
    if (!session?.token) return;
    setIsSavingGrowthRules(true);
    try {
      await apiRequest('/api/admin/v1/system/growth-rules', {
        method: 'POST',
        body: JSON.stringify({ growth_rules: createGrowthRulesDraft(growthRulesDraft) })
      }, session.token);
      await Promise.all([
        loadView('sys', { force: true }),
        loadView('users', { force: true }),
        loadView('dashboard', { force: true })
      ]);
    } finally {
      setIsSavingGrowthRules(false);
    }
  };

  const handleSendMessageReply = async () => {
    if (!session?.token || !messageThread?.user?.id || !messageReply.trim()) return;
    setIsSendingMessageReply(true);
    setMessageReplyError('');
    try {
      await apiRequest(`/api/admin/v1/messages/${messageThread.user.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ content: messageReply.trim() })
      }, session.token);
      setMessageReply('');
      await Promise.all([
        loadView('messages', { force: true }),
        loadMessageThread(messageThread.user.id)
      ]);
    } catch (err) {
      setMessageReplyError(err.message || '发送回复失败');
    } finally {
      setIsSendingMessageReply(false);
    }
  };

  const renderCurrentView = () => {
    if (currentView === 'dashboard') {
      return <DashboardView data={viewData.dashboard} loading={viewLoading.dashboard} onRefresh={() => loadView('dashboard', { force: true })} />;
    }

    if (currentView === 'users') {
      return (
        <UsersView
          data={viewData.users}
          loading={viewLoading.users}
          filters={userFilters}
          onFilterChange={(key, value) => setUserFilters((prev) => ({ ...prev, [key]: value }))}
          onSearch={(reset = false) => {
            const nextFilters = reset ? { keyword: '', status: '', vip: '' } : userFilters;
            if (reset) setUserFilters(nextFilters);
            loadView('users', { filters: nextFilters, force: true });
          }}
          onActionRequest={({ action, user }) => {
            if (action === 'view') {
              window.open(user.avatar, '_blank', 'noopener,noreferrer');
              return;
            }
            queueAction({
              action,
              user,
              endpoint: `/api/admin/v1/users/${user.id}/action`,
              title: action === 'ban' ? '封禁用户' : action === 'mute' ? '禁言用户' : action === 'grant_vip' ? '赠送 / 升级会员' : action === 'revoke_vip' ? '取消会员' : '更新用户状态',
              entityLabel: user.nickname,
              confirmText: action === 'ban' ? '确认封禁' : action === 'grant_vip' ? '确认发放' : '确认执行',
              confirmVariant: action === 'ban' ? 'danger' : action === 'revoke_vip' ? 'danger' : 'primary',
              requiresDuration: action === 'mute',
              requiresMembershipTier: action === 'grant_vip',
              defaultMembershipTier: user.membership_tier === 'pro' ? 'max' : 'pro',
              reloadViews: ['users', 'risk']
            });
          }}
          onRefresh={() => loadView('users', { force: true })}
        />
      );
    }

    if (currentView === 'verification') {
      return <SimpleTableView title="认证审核" subtitle="认证资料和状态流转。" data={viewData.verification} loading={viewLoading.verification} image={ILLUSTRATIONS.users} emptyText="还没有认证资料。" extra={<Button variant="secondary" icon={RefreshCw} onClick={() => loadView('verification', { force: true })}>刷新审核池</Button>} columns={[
        { key: 'user_name', title: '用户' },
        { key: 'name', title: '实名' },
        { key: 'contact_information', title: '联系方式' },
        {
          key: 'authentication_state',
          title: '审核状态',
          render: (row) => {
            const mapping = {
              0: { type: 'warning', text: '待审核' },
              1: { type: 'success', text: '已通过' },
              2: { type: 'danger', text: '已驳回' }
            };
            const current = mapping[row.authentication_state] || { type: 'default', text: `状态 ${row.authentication_state}` };
            return <Badge type={current.type} text={current.text} />;
          }
        },
        { key: 'updated_at', title: '更新时间' },
        {
          key: 'actions',
          title: '操作',
          align: 'right',
          render: (row) => (
            <ActionBar>
              <Button variant="ghost" size="sm" icon={Eye} onClick={() => window.open(row.identity_picture, '_blank', 'noopener,noreferrer')}>查看证件</Button>
              {row.authentication_state !== 1 && <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Check} onClick={() => queueAction({
                action: 'approve',
                endpoint: `/api/admin/v1/authentications/${row.id}/action`,
                title: '通过认证',
                entityLabel: row.user_name,
                confirmText: '确认通过',
                confirmVariant: 'success',
                reloadViews: ['verification']
              })}>通过</Button>}
              {row.authentication_state !== 2 && <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" icon={X} onClick={() => queueAction({
                action: 'reject',
                endpoint: `/api/admin/v1/authentications/${row.id}/action`,
                title: '驳回认证',
                entityLabel: row.user_name,
                confirmText: '确认驳回',
                confirmVariant: 'danger',
                defaultReason: row.overrule_content || '',
                reloadViews: ['verification']
              })}>驳回</Button>}
            </ActionBar>
          )
        }
      ]} />;
    }

    if (currentView === 'content') {
      return <SimpleTableView title="内容管理" subtitle="帖子主数据、审核状态和互动数据。" data={viewData.content} loading={viewLoading.content} image={ILLUSTRATIONS.content} emptyText="还没有帖子内容。" extra={<Button variant="secondary" icon={RefreshCw} onClick={() => loadView('content', { force: true })}>刷新内容池</Button>} columns={[
        { key: 'id', title: '帖子ID' },
        { key: 'user_name', title: '作者' },
        { key: 'circle_name', title: '圈子' },
        { key: 'posts_content', title: '内容摘要', render: (row) => <div className="max-w-[420px] whitespace-normal text-[#374151]">{row.posts_content}</div> },
        {
          key: 'audit_status',
          title: '状态',
          render: (row) => {
            if (row.is_deleted) return <Badge type="danger" text="已下架" />;
            if (row.audit_status === 1) return <Badge type="success" text="已发布" />;
            if (row.audit_status === 2) return <Badge type="warning" text="已驳回" />;
            return <Badge type="default" text={`状态 ${row.audit_status}`} />;
          }
        },
        { key: 'like_count', title: '点赞' },
        { key: 'comment_count', title: '评论' },
        { key: 'created_at', title: '发布时间' },
        {
          key: 'actions',
          title: '操作',
          align: 'right',
          render: (row) => (
            <ActionBar>
              {(row.audit_status !== 1 || row.is_deleted) && <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Check} onClick={() => queueAction({
                action: row.is_deleted ? 'restore' : 'approve',
                endpoint: `/api/admin/v1/posts/${row.id}/action`,
                title: row.is_deleted ? '恢复帖子' : '通过帖子',
                entityLabel: `帖子 #${row.id}`,
                confirmText: row.is_deleted ? '确认恢复' : '确认通过',
                confirmVariant: 'success',
                reloadViews: ['content']
              })}>{row.is_deleted ? '恢复' : '通过'}</Button>}
              {!row.is_deleted && <Button variant="ghost" size="sm" className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-50" icon={Shield} onClick={() => queueAction({
                action: 'reject',
                endpoint: `/api/admin/v1/posts/${row.id}/action`,
                title: '驳回帖子',
                entityLabel: `帖子 #${row.id}`,
                confirmText: '确认驳回',
                confirmVariant: 'danger',
                defaultReason: row.reject_msg || '',
                reloadViews: ['content']
              })}>驳回</Button>}
              {!row.is_deleted && <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" icon={Lock} onClick={() => queueAction({
                action: 'hide',
                endpoint: `/api/admin/v1/posts/${row.id}/action`,
                title: '下架帖子',
                entityLabel: `帖子 #${row.id}`,
                confirmText: '确认下架',
                confirmVariant: 'danger',
                defaultReason: row.reject_msg || '',
                reloadViews: ['content']
              })}>下架</Button>}
            </ActionBar>
          )
        }
      ]} />;
    }

    if (currentView === 'circles') {
      return <SimpleTableView title="圈子管理" subtitle="圈子创建者、简介与内容活跃度。" data={viewData.circles} loading={viewLoading.circles} image={ILLUSTRATIONS.circles} emptyText="还没有圈子数据。" extra={<Button variant="secondary" icon={RefreshCw} onClick={() => loadView('circles', { force: true })}>刷新圈子池</Button>} columns={[
        { key: 'id', title: '圈子ID' },
        { key: 'circle_name', title: '圈子名称' },
        { key: 'owner', title: '创建者' },
        {
          key: 'audit_status',
          title: '状态',
          render: (row) => row.audit_status === 1 ? <Badge type="success" text="展示中" /> : <Badge type="danger" text="已隐藏" />
        },
        { key: 'posts_count', title: '帖子数' },
        { key: 'follow_count', title: '关注数' },
        { key: 'created_at', title: '创建时间' },
        {
          key: 'actions',
          title: '操作',
          align: 'right',
          render: (row) => (
            <ActionBar>
              {row.audit_status !== 1 && <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Check} onClick={() => queueAction({
                action: 'approve',
                endpoint: `/api/admin/v1/circles/${row.id}/action`,
                title: '恢复圈子展示',
                entityLabel: row.circle_name,
                confirmText: '确认恢复',
                confirmVariant: 'success',
                reloadViews: ['circles']
              })}>恢复展示</Button>}
              {row.audit_status === 1 && <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" icon={Lock} onClick={() => queueAction({
                action: 'hide',
                endpoint: `/api/admin/v1/circles/${row.id}/action`,
                title: '隐藏圈子',
                entityLabel: row.circle_name,
                confirmText: '确认隐藏',
                confirmVariant: 'danger',
                defaultReason: row.reject_msg || '',
                reloadViews: ['circles']
              })}>隐藏</Button>}
            </ActionBar>
          )
        }
      ]} />;
    }

    if (currentView === 'risk') {
      return <RiskView data={viewData.risk} loading={viewLoading.risk} keywordsDraft={riskKeywordsDraft} onKeywordsChange={setRiskKeywordsDraft} onSaveKeywords={handleSaveRiskKeywords} savingKeywords={isSavingRiskKeywords} onRefresh={() => loadView('risk', { force: true })} />;
    }

    if (currentView === 'messages') {
      return <MessagesView data={viewData.messages} loading={viewLoading.messages} keyword={messageFilters.keyword} onKeywordChange={(value) => setMessageFilters({ keyword: value })} onSearch={() => loadView('messages', { force: true, keyword: messageFilters.keyword })} onRefresh={() => loadView('messages', { force: true, keyword: messageFilters.keyword })} threadData={messageThread} threadLoading={messageThreadLoading} onSelectThread={loadMessageThread} replyText={messageReply} onReplyChange={setMessageReply} onReplySend={handleSendMessageReply} replySending={isSendingMessageReply} replyError={messageReplyError} />;
    }

    if (currentView === 'tickets') {
      return <SimpleTableView title="反馈与工单" subtitle="来自用户的问题反馈与处理线索。" data={viewData.tickets} loading={viewLoading.tickets} image={ILLUSTRATIONS.messages} emptyText="还没有反馈工单。" extra={<Button variant="secondary" icon={RefreshCw} onClick={() => loadView('tickets', { force: true })}>刷新工单池</Button>} columns={[
        { key: 'id', title: '工单ID' },
        { key: 'user_name', title: '用户' },
        { key: 'feedback_type', title: '类型' },
        { key: 'feedback_content', title: '内容', render: (row) => <div className="max-w-[420px] whitespace-normal text-[#374151]">{row.feedback_content}</div> },
        {
          key: 'process_status',
          title: '处理状态',
          render: (row) => {
            const mapping = {
              open: { type: 'warning', text: '待处理' },
              processing: { type: 'info', text: '处理中' },
              resolved: { type: 'success', text: '已解决' }
            };
            const current = mapping[row.process_status] || { type: 'default', text: row.process_status };
            return <Badge type={current.type} text={current.text} />;
          }
        },
        { key: 'created_at', title: '提交时间' },
        {
          key: 'actions',
          title: '操作',
          align: 'right',
          render: (row) => (
            <ActionBar>
              {row.process_status !== 'processing' && row.process_status !== 'resolved' && <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" icon={RefreshCw} onClick={() => queueAction({
                action: 'processing',
                endpoint: `/api/admin/v1/feedbacks/${row.id}/action`,
                title: '标记工单处理中',
                entityLabel: `工单 #${row.id}`,
                confirmText: '确认接单',
                confirmVariant: 'primary',
                defaultReason: row.admin_reply || '',
                reloadViews: ['tickets']
              })}>处理中</Button>}
              {row.process_status !== 'resolved' && <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" icon={Check} onClick={() => queueAction({
                action: 'resolve',
                endpoint: `/api/admin/v1/feedbacks/${row.id}/action`,
                title: '完成工单处理',
                entityLabel: `工单 #${row.id}`,
                confirmText: '确认完成',
                confirmVariant: 'success',
                defaultReason: row.admin_reply || '',
                reloadViews: ['tickets']
              })}>完成处理</Button>}
              {row.process_status === 'resolved' && <Button variant="ghost" size="sm" className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-50" icon={Unlock} onClick={() => queueAction({
                action: 'reopen',
                endpoint: `/api/admin/v1/feedbacks/${row.id}/action`,
                title: '重新打开工单',
                entityLabel: `工单 #${row.id}`,
                confirmText: '确认重开',
                confirmVariant: 'primary',
                defaultReason: row.admin_reply || '',
                reloadViews: ['tickets']
              })}>重新打开</Button>}
            </ActionBar>
          )
        }
      ]} />;
    }

    if (currentView === 'orders') {
      return <SimpleTableView title="订单会员支付" subtitle="会员开通与打赏订单主表。" data={viewData.orders} loading={viewLoading.orders} image={ILLUSTRATIONS.revenue} emptyText="还没有订单记录。" columns={[
        { key: 'order_number', title: '订单号' },
        { key: 'user_name', title: '用户' },
        { key: 'order_type', title: '类型' },
        { key: 'order_pay_price', title: '金额', render: (row) => `¥${row.order_pay_price}` },
        { key: 'status', title: '状态', render: (row) => <Badge type={row.status === 'paid' ? 'success' : 'warning'} text={row.status} /> },
        { key: 'provider', title: '支付渠道' },
        { key: 'created_at', title: '创建时间' }
      ]} />;
    }

    if (currentView === 'revenue') {
      return <RevenueView data={viewData.revenue} loading={viewLoading.revenue} />;
    }

    if (currentView === 'ads' || currentView === 'ops') {
      return (
        <OperationsView
          data={viewData.ads || viewData.ops}
          loading={viewLoading.ads || viewLoading.ops}
          adsDraft={operationAdsDraft}
          onAdsChange={(index, key, value) => {
            setOperationAdsDraft((prev) => prev.map((item, currentIndex) => currentIndex === index ? { ...item, [key]: value } : item));
          }}
          onAddAd={() => setOperationAdsDraft((prev) => prev.concat([createOperationAdDraft({ sort_order: prev.length * 10 + 10 })]))}
          onRemoveAd={(index) => setOperationAdsDraft((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
          onSaveAds={handleSaveOperationAds}
          savingAds={isSavingOperationAds}
          onRefresh={() => loadView('ads', { force: true })}
        />
      );
    }

    if (currentView === 'sys') {
      return <SystemView
        data={viewData.sys}
        loading={viewLoading.sys}
        membershipPlansDraft={membershipPlansDraft}
        growthRulesDraft={growthRulesDraft}
        onMembershipPlanChange={(index, key, value) => {
          setMembershipPlansDraft((prev) => prev.map((item, currentIndex) => currentIndex === index ? { ...item, [key]: value } : item));
        }}
        onGrowthRuleChange={(key, value) => {
          setGrowthRulesDraft((prev) => createGrowthRulesDraft({ ...prev, [key]: value }));
        }}
        onGrowthThresholdChange={(index, value) => {
          setGrowthRulesDraft((prev) => {
            const next = createGrowthRulesDraft(prev);
            next.level_thresholds[index] = Number(value || 0);
            return createGrowthRulesDraft(next);
          });
        }}
        onSaveMembershipPlans={handleSaveMembershipPlans}
        onSaveGrowthRules={handleSaveGrowthRules}
        savingMembershipPlans={isSavingMembershipPlans}
        savingGrowthRules={isSavingGrowthRules}
        onRefresh={() => loadView('sys', { force: true })}
      />;
    }

    if (currentView === 'devops') {
      return <DevOpsView data={viewData.devops} loading={viewLoading.devops} />;
    }

    return <AuthView adminUser={viewData.auth?.admin_user || session?.username} />;
  };

  if (!session?.token) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-5xl grid lg:grid-cols-2 gap-10 items-center">
          <div className="hidden lg:block">
            <img src={ILLUSTRATIONS.login} alt="login" className="w-full max-h-[520px] object-contain" />
          </div>
          <div>
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
              <div className="flex justify-center text-[#2563EB]">
                <Activity className="w-12 h-12" />
              </div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-[#111827]">InfiniLink 管理控制台</h2>
              <p className="mt-2 text-center text-sm text-[#6B7280]">按高并发目标规划的小程序社区后台</p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
              <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[#E5E7EB]">
                <form className="space-y-6" onSubmit={handleLogin}>
                  <div>
                    <label className="block text-sm font-medium text-[#374151]">管理员账号</label>
                    <div className="mt-1">
                      <input value={loginForm.username} onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))} required className="appearance-none block w-full px-3 py-2 border border-[#E5E7EB] rounded-md shadow-sm placeholder-[#9CA3AF] focus:outline-none focus:ring-[#2563EB] focus:border-[#2563EB] sm:text-sm" placeholder="admin" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151]">密码</label>
                    <div className="mt-1">
                      <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))} required className="appearance-none block w-full px-3 py-2 border border-[#E5E7EB] rounded-md shadow-sm placeholder-[#9CA3AF] focus:outline-none focus:ring-[#2563EB] focus:border-[#2563EB] sm:text-sm" placeholder="••••••••" />
                    </div>
                  </div>
                  {loginError && <div className="text-sm text-red-600">{loginError}</div>}
                  <Button type="submit" variant="primary" className="w-full justify-center" size="lg" disabled={isLoggingIn}>
                    {isLoggingIn ? '登录中...' : '安全登录'}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FA] font-sans">
      <aside className={`bg-[#111827] text-white flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'} flex-shrink-0`}>
        <div className="h-16 flex items-center justify-center border-b border-gray-800 px-4">
          <Activity className="w-8 h-8 text-[#2563EB]" />
          {isSidebarOpen && <span className="ml-3 font-bold text-xl tracking-wider">InfiniLink</span>}
        </div>

        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
          {NAVIGATION.map((group) => (
            <div key={group.section} className="mb-6">
              {isSidebarOpen && <div className="px-6 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.section}</div>}
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setCurrentView(item.id)}
                      className={`w-full flex items-center px-6 py-2.5 text-sm transition-colors ${currentView === item.id ? 'bg-[#2563EB] text-white border-r-4 border-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                      title={!isSidebarOpen ? item.label : undefined}
                    >
                      <item.icon className={`w-5 h-5 ${currentView === item.id ? 'text-white' : 'text-gray-400'}`} />
                      {isSidebarOpen && <span className="ml-3">{item.label}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">{(session.username || 'A').slice(0, 2).toUpperCase()}</div>
            {isSidebarOpen && (
              <div className="ml-3 flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{session.username}</p>
                <p className="text-xs text-gray-400 truncate">Admin Console</p>
              </div>
            )}
            {isSidebarOpen && <button onClick={handleLogout} className="text-gray-400 hover:text-white ml-auto"><LogOut className="w-5 h-5" /></button>}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 flex-shrink-0 z-10">
          <div className="flex items-center">
            <button onClick={() => setIsSidebarOpen((prev) => !prev)} className="text-[#6B7280] hover:text-[#111827] focus:outline-none mr-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <nav className="flex text-sm font-medium text-[#6B7280]">
              <span>工作台</span>
              <span className="mx-2">/</span>
              <span className="text-[#111827]">{currentLabel}</span>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
              后台接口在线
            </div>
            <button className="text-[#6B7280] hover:text-[#111827] relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 relative custom-scrollbar">
          <div className="max-w-[1600px] mx-auto h-full">
            {renderCurrentView()}
          </div>
        </div>
      </main>

      <Modal
        isOpen={Boolean(pendingAction)}
        title={pendingAction?.title || '后台操作确认'}
        onClose={closeActionModal}
        onConfirm={handlePendingAction}
        confirmVariant={pendingAction?.confirmVariant || 'primary'}
        confirmText={pendingAction?.confirmText || '确认执行'}
      >
        <div className="space-y-4">
          <p>您即将执行 <strong>{getActionLabel(pendingAction?.action)}</strong>{pendingAction?.entityLabel ? <>，目标为 <strong>{pendingAction.entityLabel}</strong></> : null}。</p>
          {pendingAction?.requiresDuration && (
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">禁言时长（小时）</label>
              <input type="number" min="1" value={actionDurationHours} onChange={(e) => setActionDurationHours(e.target.value)} className="w-full border border-[#E5E7EB] rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          )}
          {pendingAction?.requiresMembershipTier && (
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">会员档位</label>
              <select value={actionMembershipTier} onChange={(e) => setActionMembershipTier(e.target.value)} className="w-full border border-[#E5E7EB] rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="pro">Pro</option>
                <option value="max">Max</option>
              </select>
              <div className="mt-2 text-xs text-[#6B7280]">普通用户可直接赠送会员，现有 Pro 用户也可以从这里升级到 Max。</div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1">操作原因</label>
            <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} className="w-full border border-[#E5E7EB] rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" rows="3" placeholder="请输入操作原因，将留存备查..." />
          </div>
          {actionError && <div className="text-sm text-red-600">{actionError}</div>}
        </div>
      </Modal>
    </div>
  );
}
