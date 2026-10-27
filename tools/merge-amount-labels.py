# -*- coding: utf-8 -*-
"""一次性：把金额融进选项文案（2026-10-28，用户拍板）。
   label 里的 {} 是占位符，原型 labelOf() 渲染时填真实金额
   （买入在上头状态会 ×1.35，占位符保证数字永远是真的）。
   安全网：只改带 spend/buy/borrow/repay/cash<0 的一侧，别的侧碰都不碰。"""
import json, shutil, sys

M = {
 # ---- 原文案已含金额的：把死数字换成占位符，上头状态也不会说错数 ----
 "fam_tutor_01":       {"r": "出 {} 报名"},
 "fam_divorce_01":     {"l": "……好，再给 {}", "r": "挽留，转 {}"},
 "fam_hospital_01":    {"r": "我出 {}"},
 "fam_inlaws_01":      {"l": "您留着养老，{} 表心意", "r": "拿 {}"},
 "work_gossip_01":     {"r": "上车 {}"},
 "work_tip_01":        {"r": "跟 {}"},
 "inc_salary_01":      {"r": "投进去 {}"},
 "soc_wedding_01":     {"r": "随 {}"},
 "soc_scam_01":        {"r": "给 {}"},
 "mkt_easing_01":      {"r": "加仓 {}"},
 "mkt_macro_01":       {"r": "抄底 {}"},
 "mkt_policy_01":      {"r": "加仓 {}"},
 "risk_margin_01":     {"r": "先配 {}"},
 "risk_loanad_01":     {"r": "借 {} 抄底"},
 "risk_influencer_01": {"r": "跟 {}"},
 "risk_callmargin_01": {"r": "再借 {} 补上"},
 "risk_repay_01":      {"r": "还 {}"},
 "risk_dca_01":        {"r": "每月投 {}"},
 "soc_insider_01":     {"r": "掏 {} 试试"},
 "fam_inlaws_03":      {"l": "包 {}", "r": "包 {}"},
 "fam_momhealth_02":   {"r": "转 {} 买补品"},
 "fam_hospital_02":    {"l": "连夜回去垫 {}"},
 "love_debt_01":       {"l": "多还 {}", "r": "先还最低 {}"},
 "life_phone_01":      {"r": "换块屏，{}"},
 "life_tooth_01":      {"r": "拔了，{}"},
 "life_glasses_01":    {"r": "配副新的，{}"},
 "life_aircon_01":     {"r": "换台新的，{}"},
 "life_deposit_01":    {"r": "补 {}"},
 "life_parents_01":    {"r": "买台新的，{}"},
 "life_travel_01":     {"r": "一起去，{}"},
 "life_ebike_01":      {"r": "再买一台，{}"},
 # ---- 原文案没金额的：把数字写进句子里 ----
 "fam_confess_01":     {"r": "说实话，转 {} 给她"},
 "fam_dinner_01":      {"r": "出去吃，我请 {}"},
 "fam_pregnant_01":    {"r": "留着，先花 {}"},
 "fam_eldermoney_01":  {"l": "不能要，{} 买补品寄家", "r": "收下，{} 投进去"},
 "fam_fever_01":       {"r": "连夜挂急诊，{}"},
 "fam_rent_01":        {"l": "搬家，先掏 {}", "r": "认了，先补 {}"},
 "work_layoff_01":     {"r": "装没听见，{} 继续补"},
 "work_layoff_02":     {"l": "{} 请部门喝奶茶"},
 "work_options_01":    {"r": "理解，自掏 {} 认购"},
 "inc_bonus_01":       {"l": "{} 给家里买点东西", "r": "{} 全部加仓"},
 "soc_lend_01":        {"r": "{} 全借"},
 "soc_reunion_01":     {"r": "去，AA {}"},
 "self_checkup_01":    {"l": "不看了，{} 买血压计"},
 "self_weekend_01":    {"l": "花 {} 带家人走走"},
 "self_hairloss_01":   {"l": "去挂个号，{}"},
 "self_birthday_01":   {"r": "花 {} 给自己买点东西"},
 "mkt_earnings_01":    {"r": "{} 补仓摊成本"},
 "dec_takeprofit_01":  {"l": "落袋，{} 犒劳自己"},
 "dec_size_01":        {"l": "只加 {}", "r": "{} 满上"},
 "mkt_bubble_01":      {"r": "跟着加 {}"},
 "mkt_paperwin_01":    {"l": "够了，走人，{} 庆祝"},
 "mkt_crisis_01":      {"r": "这是机会，抄 {}"},
 "risk_card_01":       {"l": "咬牙全额还 {}", "r": "只还最低 {}"},
 "risk_scam_01":       {"r": "交 {}"},
 "risk_leak_01":       {"r": "{} 满仓埋伏"},
 "acc_cat_01":         {"l": "赶紧撤单，贴 {}", "r": "就当 {} 长线投资"},
 "pet_adopt_01":       {"l": "收编，花 {} 置办"},
 "fam_reportcard_01":  {"r": "现在就签，{} 犒劳"},
 "fam_inlaws_02":      {"l": "还行还行，塞 {} 过关"},
 "risk_bill_01":       {"l": "再借 {}"},
 "mkt_bull_open_01":   {"l": "{} 换半仓进去"},
 "mkt_bull_taxi_01":   {"r": "互换代码，跟 {}"},
 "mkt_bull_lever_01":  {"r": "小仓 {} 试一手"},
 "mkt_bull_family_01": {"l": "我去劝，{} 买点好酒"},
 "mkt_bear_group_01":  {"l": "{} 发红包暖场"},
 "mkt_bear_loan_01":   {"l": "砸锅卖铁先还 {}"},
 "mkt_policy_whim_01": {"l": "跟风向，{} 调仓"},
 "mkt_bear_fund_01":   {"r": "{} 补一笔摊成本"},
 "mkt_taxi_02":        {"l": "跟一手小的，{}"},
 "mkt_chase_01":       {"l": "{} 追买回来"},
 "fam_momhealth_01":   {"r": "{} 预约陪复查"},
 "fam_landlordfix_01": {"l": "自己找人修，{}"},
 "fam_anniv_01":       {"l": "订了餐厅，{}"},
 "fam_kidsfee_01":     {"l": "续费，交 {}"},
 "fam_prenatal_01":    {"l": "陪她去，花 {}"},
 "fam_anniv_02":       {"l": "再订一次，{}"},
 "fam_momcall_02":     {"l": "花 {} 寄箱水果"},
 "fam_child_02":       {"l": "{} 装裱挂客厅"},
 "fam_teacher_02":     {"l": "保证，{} 买亲子票"},
 "fam_reportcard_02":  {"l": "花 {} 全家下馆子"},
 "fam_yuehui_01":      {"l": "陪她走一走，{}"},
 "fam_zhaohu_01":      {"l": "陪她看，{} 两张票"},
 "fam_zhoumo_01":      {"l": "回去吃饭，带 {}"},
 "fam_shengri_01":     {"l": "认真安排，花 {}", "r": "转 {} 红包打发"},
 "fam_queding_01":     {"l": "定下来，{} 吃顿好的"},
 "fam_chenmo_01":      {"l": "花 {} 补救一下"},
 "fam_jiazhang_01":    {"l": "备足礼数，{}"},
 "fam_zanqian_01":     {"l": "一起攒，先转 {}"},
 "fam_lengzhan_01":    {"l": "带上 {} 上门道歉"},
 "fam_caili_01":       {"l": "先付 {}，打欠条"},
 "fam_hunli_01":       {"l": "{} 风风光光办", "r": "一切从简，{}"},
 "fam_shoufu_01":      {"l": "借，凑 {} 交首付"},
 "pet_food_01":        {"l": "下单进口的，{}"},
 "pet_vac_01":         {"l": "打，{}"},
 "pet_sick_01":        {"l": "治，先交 {}"},
 "work_xiaowang_02":   {"l": "{} 借给他"},
 "self_checkup_02":    {"l": "{} 拿药，早睡"},
 "self_weekend_02":    {"l": "陪她回，带上 {}"},
 "self_birthday_02":   {"l": "关掉账户页，{} 买块蛋糕"},
 "self_hairloss_02":   {"l": "叫师傅，花 {}"},
 "inc_salary_02":      {"l": "转一半 {} 补仓"},
 "soc_oldmate_01":     {"l": "去了，AA {}"},
 "soc_lend_02":        {"l": "借一半，{}"},
 "work_tuanjian_01":   {"r": "去，摊 {}"},
 "work_focus_02":      {"l": "{} 请组员喝奶茶"},
 "work_raise_02":      {"r": "花 {} 请客庆祝"},
}

def amount(e):
    if "spend" in e: return e["spend"], "spend"
    if "buy" in e:   return e["buy"], "buy"
    if "borrow" in e:return e["borrow"], "borrow"
    if "repay" in e: return e["repay"], "repay"
    if isinstance(e.get("cash"), (int, float)) and e["cash"] < 0:
        return -e["cash"], "cash"
    return None, None

path = "data/cards.json"
shutil.copy(path, path + ".bak")
data = json.load(open(path, encoding="utf-8"))
applied, missing = 0, []
for c in data["cards"]:
    m = M.get(c["id"])
    if not m: continue
    for side_key, side in (("l", "left"), ("r", "right")):
        if side_key not in m: continue
        o = c.get(side) or {}
        e = o.get("effects") or {}
        amt, kind = amount(e)
        if amt is None:
            missing.append(f"{c['id']}.{side_key} 没有金额类效果，跳过")
            continue
        o["label"] = m[side_key]
        applied += 1
json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"applied {applied}")
for x in missing: print("SKIP", x)
# 没用上的映射也要报出来，防止卡 id 写错静默漏改
ids = {c["id"] for c in data["cards"]}
for k in M:
    if k not in ids: print("WARN id 不存在:", k)
