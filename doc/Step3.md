需要你遵循doc/Agent.md来完成任务
这个设计的Idea: doc/Step0_idea.md
基础实现: Step1.md, Step2.md(都不用看)

# 任务:调整VM的状态保持和子函数调用.

## 统一Machine状态. 
1. 在src\platform\pc\vm_pc_api.c的vm_pc_api.c中去除冗余全局变量, 对应处理src\platform\wasm\vm_wasm_api.c
2. 引入vm_device_ctx_t结构, 包含VM全局变量, VM的Flash地址指针, VM的vm_screen_ctx_t


## 提升子函数易用性. 
1. 在需求层面: VM的主函数和子函数不会同时调用,只需要保存全局变量,就可以快速恢复虚拟机状态开始执行任何过程.
2. 需要将vm的vm_render_canvas改成vm_run, 添加function index参数.
3. 外部提供FFI, 可以将function index注册到外部的事件id上. 外部平台与编译器约定事件ID.

 
 遗留一些问题:
 1. vm_init -> 干掉reinit -> color_mode, resource的保存问题.
 2. 二值化模式的反色问题, 希望通过特殊的颜色值解决: color_matches_render