export function WhatsAppButton() {
  const phone = "5521992046054";
  const url = `https://wa.me/${phone}`;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-1.5">
      <span className="text-[10px] md:text-xs font-semibold text-white bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 whitespace-nowrap shadow">
        Dúvidas e Suporte
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Fale conosco no WhatsApp"
        className="flex items-center justify-center h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg hover:scale-110 transition-transform"
        style={{ backgroundColor: "#25D366" }}
      >
        <svg viewBox="0 0 32 32" className="h-6 w-6 md:h-8 md:w-8 fill-white">
          <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.128 6.744 3.046 9.378L1.054 31.2l6.018-1.932A15.92 15.92 0 0 0 16.004 32C24.826 32 32 24.826 32 16.004S24.826 0 16.004 0zm9.31 22.614c-.39 1.1-1.932 2.014-3.146 2.28-.828.18-1.908.324-5.546-1.192-4.654-1.938-7.648-6.66-7.882-6.968-.224-.31-1.836-2.446-1.836-4.666 0-2.22 1.162-3.312 1.574-3.766.39-.426 1.028-.606 1.636-.606.198 0 .376.01.536.018.454.02.682.046.982.758.376.89 1.292 3.152 1.404 3.382.114.23.228.538.078.848-.14.318-.262.46-.492.724-.23.264-.448.466-.678.75-.214.248-.454.514-.194.968.26.454 1.156 1.904 2.482 3.084 1.706 1.518 3.142 1.988 3.59 2.21.334.166.634.138.868-.084.296-.282.664-.75 1.038-1.21.266-.328.6-.37.968-.222.372.14 2.354 1.112 2.758 1.314.404.204.674.306.772.472.096.166.096.962-.294 2.062z" />
        </svg>
      </a>
    </div>
  );
}
