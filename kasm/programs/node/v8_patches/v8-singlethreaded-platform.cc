// Minimal single-threaded V8 Platform for WebAssembly
// No worker threads - all tasks run synchronously on the foreground thread

#include "v8.h"
#include <memory>
#include <vector>

namespace v8_singlethreaded {

class SingleThreadedTaskRunner : public v8::TaskRunner {
public:
    void PostTask(std::unique_ptr<v8::Task> task) override {
        task->Run();
    }

    void PostNonNestableTask(std::unique_ptr<v8::Task> task) override {
        task->Run();
    }

    void PostDelayedTask(std::unique_ptr<v8::Task> task, double delay_in_seconds) override {
        (void)delay_in_seconds;
        task->Run();
    }

    void PostNonNestableDelayedTask(std::unique_ptr<v8::Task> task, double delay_in_seconds) override {
        (void)delay_in_seconds;
        task->Run();
    }

    void PostIdleTask(std::unique_ptr<v8::IdleTask> task) override {
        task->Run(1000.0);  // Fake idle time
    }

    bool NonNestableTasksEnabled() const override { return true; }

    bool IdleTasksEnabled() override { return false; }
};

class SingleThreadedPlatform : public v8::Platform {
public:
    int NumberOfWorkerThreads() override { return 0; }

    std::shared_ptr<v8::TaskRunner> GetForegroundTaskRunner(
        v8::Isolate* isolate, v8::TaskPriority priority) override {
        (void)isolate;
        (void)priority;
        if (!task_runner_) {
            task_runner_ = std::make_shared<SingleThreadedTaskRunner>();
        }
        return task_runner_;
    }

    void PostTaskOnWorkerThreadImpl(v8::TaskPriority priority,
                                    std::unique_ptr<v8::Task> task,
                                    v8::SourceLocation location) override {
        (void)priority;
        (void)location;
        // Single-threaded: run task immediately on foreground
        task->Run();
    }

    void PostJobImpl(v8::TaskPriority priority,
                     std::unique_ptr<v8::JobTask> job_task,
                     std::shared_ptr<v8::JobHandle>* handle,
                     v8::SourceLocation location) override {
        (void)priority;
        (void)location;
        (void)handle;
        // Single-threaded: run job immediately
        job_task->RunJob(v8::JobDelegate());
    }

    double CurrentClockTimeMillis() override { return 0.0; }

    double MonotonicallyIncreasingTime() override { return 0.0; }

    v8::StackTracePrinter* GetStackTracePrinter() override { return nullptr; }

    v8::PageAllocator* GetPageAllocator() override { return nullptr; }

    void OnCriticalMemoryPressure() override {}

private:
    std::shared_ptr<SingleThreadedTaskRunner> task_runner_;
};

// Factory function
std::unique_ptr<v8::Platform> CreateSingleThreadedPlatform() {
    return std::make_unique<SingleThreadedPlatform>();
}

} // namespace v8_singlethreaded
