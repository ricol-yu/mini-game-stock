// 卡面内容抽样自 v3 原型的真实卡片，仅用于验证手感与 WXSS 还原度，
// 不承载任何游戏逻辑。逻辑层在这里只做两件事：
//   1. 换卡（一次 setData）
//   2. 显示 WXS 回传的测量数据
// 划动过程中的所有帧级操作都在 gesture.wxs 里完成，不经过 setData。

var CARDS = [
  {
    av: '💍',
    who: '老婆',
    tag: '家庭',
    txt: '这个月房贷 6,800。你看着办。',
    L: '先拖两天',
    R: '出 4,200'
  },
  {
    av: '💍',
    who: '老婆',
    tag: '家庭',
    txt: '你到底亏了多少？我要听实话。',
    L: '报喜不报忧',
    R: '说实话'
  },
  {
    av: '💍',
    who: '老婆',
    tag: '家庭',
    txt: '我们多久没一起吃饭了？',
    L: '最近有点忙',
    R: '出去吃，我请'
  }
];

Page({
  data: {
    card: CARDS[0],
    idx: 0,
    round: 0,
    rep: null,
    verdict: '滑一次卡片，这里会出测量结果',
    verdictLevel: '',
    repeat: false,
    swipes: 0
  },

  busy: false,

  onGesture: function (arg) {
    var d = arg && arg.detail ? arg.detail : arg;
    if (!d || this.busy) return;

    var self = this;
    var level = '';
    var msg = '';

    var g = d.avgGap;
    if (g <= 12) {
      msg = '高刷屏（约 ' + Math.round(1000 / g) + 'Hz），采样正常';
    } else if (g <= 22) {
      msg = '60Hz 正常，跟手应当没问题';
    } else if (g <= 34) {
      msg = '低于 60Hz，有轻中度掉帧';
      level = 'warn';
    } else {
      msg = '明显掉帧，单次间隔最长 ' + d.maxGap + 'ms';
      level = 'warn';
    }

    if (d.costAvg > 1.5) {
      msg = msg + '；WXS 单帧耗时偏高（' + d.costAvg + 'ms）';
      level = 'warn';
    }

    this.setData({
      rep: d,
      verdict: msg,
      verdictLevel: level,
      swipes: this.data.swipes + 1
    });

    if (!d.fired) return;

    this.busy = true;
    setTimeout(function () {
      var next = self.data.idx + 1;
      if (self.data.repeat) {
        next = self.data.idx;
      } else if (next >= CARDS.length) {
        next = 0;
      }
      self.setData({
        card: CARDS[next],
        idx: next,
        round: self.data.round + 1
      });
      self.busy = false;
    }, 300);
  },

  toggleRepeat: function () {
    this.setData({ repeat: !this.data.repeat });
  },

  restart: function () {
    this.busy = false;
    this.setData({
      card: CARDS[0],
      idx: 0,
      round: this.data.round + 1,
      rep: null,
      verdict: '滑一次卡片，这里会出测量结果',
      verdictLevel: '',
      swipes: 0
    });
  }
});
