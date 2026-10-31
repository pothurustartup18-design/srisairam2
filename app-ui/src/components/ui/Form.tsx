import { createContext, forwardRef, useEffect, useRef, useState, type FormHTMLAttributes } from 'react';

/** True while the enclosing <Form>'s async submit handler is running. */
export const FormPendingContext = createContext(false);

/**
 * Drop-in <form> that tracks async submissions. While the onSubmit promise is
 * pending it sets aria-busy (styling every submit button with a spinner, see
 * index.css), lets <Button type="submit"> show its busy state, and swallows
 * repeat submits so a double tap can't create duplicate records. The state
 * always resets when the handler settles, whether it succeeded or threw.
 */
export const Form = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(
  function Form({ onSubmit, children, ...props }, ref) {
    const [pending, setPending] = useState(false);
    const pendingRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const handleSubmit: NonNullable<FormHTMLAttributes<HTMLFormElement>['onSubmit']> = (e) => {
      if (pendingRef.current) { e.preventDefault(); return; }
      const result = onSubmit?.(e) as unknown;
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        pendingRef.current = true;
        setPending(true);
        const done = () => {
          pendingRef.current = false;
          if (mounted.current) setPending(false);
        };
        (result as Promise<unknown>).then(done, done);
      }
    };

    return (
      <form ref={ref} onSubmit={handleSubmit} aria-busy={pending || undefined} {...props}>
        <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
      </form>
    );
  },
);
